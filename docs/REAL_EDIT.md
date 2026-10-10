# Real-footage videos

A second video mode next to the Pip animated videos. Input: a topic or a script. Output: a vertical video
(1080x1920, 30 fps) edited from real photos and clips, with voice, captions, music and sound effects.
Free and open source only: no paid APIs, no AI-generated pictures.

```
npx tsx scripts/make-video.ts --seconds 20 "how the Moon moves away from Earth"
npx tsx scripts/make-video.ts --file my-script.txt        # blank line = new section
```
Result: `out/<slug>.mp4` (crf 18) and `out/<slug>.credits.json` (licence and source page of every file).
From code (the Telegram bot): `import {makeVideo} from './scripts/footage/make'` then `await makeVideo({topic, maxSeconds: 45})`.

## Steps
1. **Footage**, in this order:
   - Your library: `library/clips/` and `library/photos/`. `scripts/scan-media.ts` writes `library/media.json` (ffprobe),
     then OpenCLIP ViT-B-32 indexes every file into `library/index.json`. Only new files are indexed.
     Long clips are split into shots with PySceneDetect, so the best part of a clip can be used.
   - Wikimedia Commons and Internet Archive (no key). Only CC0, public domain and CC BY are taken.
   - Pexels and Pixabay official APIs, only if `PEXELS_KEY` / `PIXABAY_KEY` (free keys) are set.
   Downloads go into the library with their licence in `library/credits.json`, so the library grows.
2. **Script to shots**: the script is split into lines. Every line starts a new shot; long lines get more shots,
   1.2 to 3.5 s each, uneven, and cuts move onto the music beat when close. Each shot gets the best-matching
   footage (OpenCLIP), not used before in the video, vertical preferred. If nothing fits, step 1 downloads more.
3. **Voice**: Kokoro (local, voice af_heart). Word timings: faster-whisper (local). Music: a random track
   from `library/music/` (if empty, a CC0/public-domain/CC BY track from Internet Archive). SFX from `library/sfx/`
   (whoosh on section changes, a soft hit on a few emphasis cuts; both are made with ffmpeg if missing).
4. **Edit** (`remotion/realedit/`): mostly hard cuts, 8-12 frame fade/slide/wipe only between sections,
   Ken Burns on every photo (1.0 to 1.08, eased), punch-in (1.0 to 1.04) and an occasional speed ramp on clips,
   1-2 px handheld shake on some shots, one LUT grade on everything (`library/luts/main.cube`, applied with
   ffmpeg and cached in `library/graded/`), 3.5% grain, soft vignette, word-by-word captions in the TikTok safe
   area, music ducked under the voice with fades.

If a step fails it is tried once more, then the next fallback is used (for example word matching instead of
OpenCLIP, or the next footage source) instead of stopping.

## Setup on your computer
```
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r scripts/footage/requirements.txt
# ffmpeg must be installed
```
Swap the look: put any free `.cube` file at `library/luts/main.cube`. Preview the edit: `npm run studio:realedit`.

## On GitHub Actions
`.github/workflows/real-edit.yml` (Actions tab > Real-footage video > Run workflow) makes a video and puts it on the
`previews-real-edit` branch. The library and models are kept in the Actions cache, never in git.
