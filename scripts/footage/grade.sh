#!/usr/bin/env bash
# Grades every clip and photo in the library with one LUT, so footage from different sources matches.
#   scripts/footage/grade.sh [library-folder]
# Output: <library>/graded/<lut hash>/clips/... and .../photos/... (already graded files are skipped).
# The pipeline does the same for the files a video uses, so running this by hand is optional.
set -euo pipefail
LIB="${1:-library}"
LUT="$LIB/luts/main.cube"
if [ ! -f "$LUT" ]; then
  npx tsx scripts/scan-media.ts "$LIB" --no-index >/dev/null
fi
HASH=$(sha1sum "$LUT" | cut -c1-8)
for f in "$LIB"/clips/* "$LIB"/photos/*; do
  [ -f "$f" ] || continue
  rel="${f#"$LIB"/}"
  out="$LIB/graded/$HASH/$rel"
  [ -f "$out" ] && [ "$out" -nt "$f" ] && continue
  mkdir -p "$(dirname "$out")"
  case "$f" in
    *.jpg|*.jpeg|*.png|*.webp) ffmpeg -y -loglevel error -i "$f" -frames:v 1 -vf "lut3d=file=$LUT:interp=tetrahedral" -q:v 2 "$out" ;;
    *) ffmpeg -y -loglevel error -i "$f" -an -vf "lut3d=file=$LUT:interp=tetrahedral,format=yuv420p" -c:v libx264 -preset veryfast -crf 17 -movflags +faststart "$out" ;;
  esac
  echo "graded $rel"
done
