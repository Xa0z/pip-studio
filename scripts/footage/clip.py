#!/usr/bin/env python3
"""OpenCLIP footage index for real-footage videos (all local, free).

  python3 scripts/footage/clip.py index --library library
      Embeds every photo and clip listed in library/media.json (made by scan-media)
      into library/index.json. Only new or changed files are embedded again.
      Long clips are split into shots with PySceneDetect; each shot gets its own embedding.

  python3 scripts/footage/clip.py match --library library < queries.json
      queries.json: {"queries": [{"id": "s1", "text": "a lighthouse at night"}], "top": 25}
      Prints {"results": {"s1": [{"file": ..., "seg": 0, "score": 0.31}, ...]}}

Model: ViT-B-32 (laion2b_s34b_b79k), downloaded once into HF_HOME.
"""
import argparse
import base64
import json
import os
import subprocess
import sys

MODEL = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
MAX_SEGMENTS = 14  # per clip
MAX_SEG_SECONDS = 6.0
NEGATIVE = ["a screenshot of text", "a document with lots of words", "a slide with a title and captions", "a weather map with labels", "a chart or diagram"]  # longer shots are cut into pieces so each piece can be matched on its own

_model = None


def log(msg):
    print(f"[clip] {msg}", file=sys.stderr, flush=True)


def load():
    global _model
    if _model is None:
        import open_clip
        import torch

        torch.set_num_threads(max(1, os.cpu_count() or 1))
        model, _, preprocess = open_clip.create_model_and_transforms(MODEL, pretrained=PRETRAINED)
        model.eval()
        _model = (model, preprocess, open_clip.get_tokenizer(MODEL), torch)
    return _model


def pack(vec):
    import numpy as np

    return base64.b64encode(np.asarray(vec, dtype=np.float16).tobytes()).decode()


def unpack(s):
    import numpy as np

    return np.frombuffer(base64.b64decode(s), dtype=np.float16).astype(np.float32)


def embed_images(images):
    model, preprocess, _, torch = load()
    with torch.no_grad():
        batch = torch.stack([preprocess(im) for im in images])
        feats = model.encode_image(batch)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy()


def embed_texts(texts):
    model, _, tokenizer, torch = load()
    with torch.no_grad():
        feats = model.encode_text(tokenizer(texts))
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.cpu().numpy()


def frame_at(path, t):
    """One frame of a video as a PIL image (ffmpeg, so every codec works)."""
    from io import BytesIO

    from PIL import Image

    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", path, "-frames:v", "1", "-vf", "scale=448:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
        capture_output=True,
        timeout=60,
    )
    if out.returncode != 0 or not out.stdout:
        raise RuntimeError(f"no frame at {t:.2f}s")
    return Image.open(BytesIO(out.stdout)).convert("RGB")


def scenes(path, duration):
    """Shot boundaries with PySceneDetect. Falls back to even pieces if it is not installed."""
    cuts = []
    try:
        from scenedetect import ContentDetector, detect

        cuts = [(a.get_seconds(), b.get_seconds()) for a, b in detect(path, ContentDetector(threshold=27.0), show_progress=False)]
    except Exception as e:  # noqa: BLE001
        log(f"scene detection skipped for {os.path.basename(path)}: {e}")
    if not cuts:
        cuts = [(0.0, duration)]
    pieces = []
    for a, b in cuts:
        while b - a > MAX_SEG_SECONDS * 1.5:
            pieces.append((a, a + MAX_SEG_SECONDS))
            a += MAX_SEG_SECONDS
        if b - a >= 0.8:
            pieces.append((a, b))
    if len(pieces) > MAX_SEGMENTS:  # keep an even spread
        step = len(pieces) / MAX_SEGMENTS
        pieces = [pieces[int(i * step)] for i in range(MAX_SEGMENTS)]
    return pieces or [(0.0, duration)]


def index_item(lib, item):
    from PIL import Image

    path = os.path.join(lib, item["file"])
    if item["kind"] == "photo":
        im = Image.open(path).convert("RGB")
        return [{"start": 0, "end": 0, "emb": pack(embed_images([im])[0])}]
    segs = []
    for a, b in scenes(path, item.get("duration") or 0):
        # Average three frames of the shot: steadier than one frame.
        ims = [frame_at(path, a + (b - a) * f) for f in (0.2, 0.5, 0.8)]
        vec = embed_images(ims).mean(axis=0)
        vec = vec / (float((vec**2).sum()) ** 0.5)
        segs.append({"start": round(a, 3), "end": round(b, 3), "emb": pack(vec)})
    return segs


def cmd_index(lib):
    media = json.load(open(os.path.join(lib, "media.json")))
    idx_path = os.path.join(lib, "index.json")
    old = {}
    if os.path.exists(idx_path):
        try:
            old = {e["file"]: e for e in json.load(open(idx_path)).get("items", [])}
        except Exception:  # noqa: BLE001
            old = {}
    items, new = [], 0
    for item in media["items"]:
        prev = old.get(item["file"])
        if prev and prev.get("size") == item.get("size") and prev.get("mtime") == item.get("mtime") and prev.get("model") == MODEL:
            items.append({**prev, **{k: item[k] for k in item if k != "segments"}})
            continue
        try:
            segs = index_item(lib, item)
        except Exception as e:  # noqa: BLE001
            log(f"skipped {item['file']}: {e}")
            continue
        items.append({**item, "model": MODEL, "segments": segs})
        new += 1
        log(f"indexed {item['file']} ({len(segs)} shot{'s' if len(segs) != 1 else ''})")
    tmp = idx_path + ".tmp"
    json.dump({"model": f"{MODEL}/{PRETRAINED}", "items": items}, open(tmp, "w"))
    os.replace(tmp, idx_path)
    print(json.dumps({"indexed": new, "total": len(items)}))


def cmd_match(lib):
    import numpy as np

    req = json.load(sys.stdin)
    top = int(req.get("top", 25))
    idx = json.load(open(os.path.join(lib, "index.json")))
    keys, mat = [], []
    for e in idx["items"]:
        for i, s in enumerate(e.get("segments", [])):
            keys.append((e["file"], i))
            mat.append(unpack(s["emb"]))
    results = {}
    if keys and req["queries"]:
        m = np.stack(mat)
        texts = embed_texts([q["text"][:300] for q in req["queries"]])
        sims = texts @ m.T
        # Footage full of on-screen text, charts or maps looks like a slide, not a shot: push it down.
        neg = embed_texts(NEGATIVE) @ m.T
        pos = embed_texts(["a photo", "a film still"]) @ m.T
        penalty = np.clip(neg.max(axis=0) - pos.max(axis=0) + 0.02, 0, None) * 1.5
        sims = sims - penalty[None, :]
        for q, row in zip(req["queries"], sims):
            order = np.argsort(-row)[:top]
            results[q["id"]] = [{"file": keys[j][0], "seg": keys[j][1], "score": round(float(row[j]), 4)} for j in order]
    print(json.dumps({"results": results}))


def cmd_health():
    load()
    print(json.dumps({"ok": True, "model": f"{MODEL}/{PRETRAINED}"}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["index", "match", "health"])
    p.add_argument("--library", default="library")
    a = p.parse_args()
    if a.cmd == "index":
        cmd_index(a.library)
    elif a.cmd == "match":
        cmd_match(a.library)
    else:
        cmd_health()
