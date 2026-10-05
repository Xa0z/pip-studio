#!/usr/bin/env bash
# Builds the two sound effects used in every video. Synthesised here, so there is nothing to license.
set -euo pipefail
cd "$(dirname "$0")/../assets/sfx"
# Whoosh: filtered pink noise with a quick swell, for scene cuts.
ffmpeg -y -loglevel error -f lavfi -i "anoisesrc=d=0.45:c=pink:a=0.9:r=44100" \
  -af "highpass=f=350,lowpass=f=3800,afade=t=in:st=0:d=0.22:curve=exp,afade=t=out:st=0.22:d=0.23:curve=exp,volume=4.5" \
  -ac 1 whoosh.wav
# Pop: a short falling sine blip, for the follow button tap.
ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=sin(2*PI*(420+900*exp(-t*38))*t)*exp(-t*26):s=44100:d=0.18" \
  -ac 1 pop.wav
# Click: a tight mouse click (two very short noise ticks).
ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=(random(0)*2-1)*(exp(-t*900)+0.6*exp(-(t-0.035)*900)*gte(t\,0.035)):s=44100:d=0.08" \
  -af "highpass=f=1500,volume=1.6" -ac 1 click.wav
# Typing: soft key ticks at an uneven rhythm, 4 seconds (trimmed to the typing length in the video).
ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=(random(0)*2-1)*exp(-mod(t\,0.083+0.02*sin(t*7))*500)*(0.6+0.4*sin(t*13)):s=44100:d=4" \
  -af "highpass=f=1200,lowpass=f=7000,volume=2.2" -ac 1 typing.wav
