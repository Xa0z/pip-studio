#!/usr/bin/env python3
"""Word timings for the voiceover with faster-whisper (local, free).

  python3 scripts/footage/captions.py voice.wav captions.json [--model base.en]

Writes [{"text": "Hello", "start": 0.31, "end": 0.58}, ...] (seconds).
"""
import argparse
import json
import os

p = argparse.ArgumentParser()
p.add_argument("audio")
p.add_argument("out")
p.add_argument("--model", default=os.environ.get("FASTER_WHISPER_MODEL", "base.en"))
a = p.parse_args()

from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel(a.model, device="cpu", compute_type="int8")
segments, _ = model.transcribe(a.audio, language="en", word_timestamps=True, vad_filter=False, beam_size=5)
words = []
for seg in segments:
    for w in seg.words or []:
        t = w.word.strip()
        if t:
            words.append({"text": t, "start": round(w.start, 3), "end": round(w.end, 3)})
json.dump(words, open(a.out, "w"))
print(json.dumps({"words": len(words)}))
