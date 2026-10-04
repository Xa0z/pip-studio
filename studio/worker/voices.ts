/** Voice samples for onboarding: Kokoro says hello in 3 voices, converted to OGG/Opus for Telegram. */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {voiceSample} from '../../src/voice.js';

export const helloLine = (name: string | null) =>
  name ? `Hi! I'm ${name}! Let's learn something cool together. Ready?` : `Hi there! Let's learn something cool together. Ready?`;

export async function makeVoiceSamples(dir: string, voices: string[], name: string | null): Promise<{voice: string; file: string}[]> {
  fs.mkdirSync(dir, {recursive: true});
  const out: {voice: string; file: string}[] = [];
  for (const v of voices) {
    const wav = path.join(dir, `${v}.wav`);
    await voiceSample(helloLine(name), v, wav, 1.0);
    const ogg = path.join(dir, `${v}.ogg`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '48k', ogg]);
    out.push({voice: v, file: ogg});
  }
  return out;
}
