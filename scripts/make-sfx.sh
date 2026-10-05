#!/usr/bin/env bash
# Builds the two sound effects used in every video. Synthesised here, so there is nothing to license.
set -euo pipefail
cd "$(dirname "$0")/../assets/sfx"
# Whoosh: filtered pink noise with a quick swell, for scene cuts.
ffmpeg -y -loglevel error -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.9:r=44100" \
  -af "highpass=f=350,lowpass=f=3800,afade=t=in:st=0:d=0.22:curve=exp,afade=t=out:st=0.22:d=0.23:curve=exp,volume=1.4" \
  -ac 1 whoosh.wav
# Pop: a short falling sine blip, for the follow button tap.
ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=sin(2*PI*(420+900*exp(-t*38))*t)*exp(-t*26):s=44100:d=0.18" \
  -ac 1 pop.wav
