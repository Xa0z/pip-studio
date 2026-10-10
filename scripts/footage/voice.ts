/**
 * Voiceover with Kokoro (local, free; voice af_heart by default) and word timings with faster-whisper (local, free).
 * Each line is spoken on its own and joined with short, uneven pauses, so every line's start time is exact.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {alignWords, Heard} from '../../src/align.js';
import {config, MODELS_DIR} from '../../src/config.js';
import {log} from '../../src/log.js';
import type {Word} from '../../src/schema.js';
import {KOKORO_MODEL} from '../../src/voice.js';
import {concat, trimSilence, writeWav} from '../../src/wav.js';
import {FOOTAGE_DIR, PYTHON} from './paths.js';
import type {Line} from './shots.js';

export type Voiceover = {wavPath: string; starts: number[]; ends: number[]; speechEnd: number};

const LEAD_IN = 0.25;

let kokoro: any = null;
async function speak(text: string, voice: string, speed: number): Promise<{samples: Float32Array; rate: number}> {
  if (process.env.TTS_PROVIDER === 'fake') {
    const rate = 24000;
    const secs = (text.split(/\s+/).length * 0.36) / speed + 0.1;
    const samples = new Float32Array(Math.floor(secs * rate));
    for (let i = 0; i < samples.length; i++) samples[i] = 0.02 * Math.sin(i / 8);
    return {samples, rate};
  }
  if (!kokoro) {
    const {env} = await import('@huggingface/transformers');
    env.cacheDir = path.join(MODELS_DIR, 'kokoro');
    const {KokoroTTS} = await import('kokoro-js');
    log.info(`Loading Kokoro (${KOKORO_MODEL})`);
    kokoro = await KokoroTTS.from_pretrained(KOKORO_MODEL, {dtype: 'q8', device: 'cpu'});
  }
  const audio = await kokoro.generate(text, {voice, speed});
  return {samples: audio.audio as Float32Array, rate: audio.sampling_rate as number};
}

/** Speaks the lines in order. With `maxEnd` (seconds), lines that would end after it are left out (at least one is kept). */
export async function speakLines(lines: Line[], dir: string, rand: () => number, voice = config.PIP_VOICE, speed = config.VOICE_SPEED, maxEnd = Infinity): Promise<Voiceover> {
  const parts: Float32Array[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let rate = 24000;
  let t = LEAD_IN;
  for (const [i, line] of lines.entries()) {
    const r = await speak(line.text, voice, speed);
    rate = r.rate;
    const clip = trimSilence(r.samples, rate);
    // A real speaker breathes: short pauses inside a section, a longer one between sections.
    const pause = i === 0 ? LEAD_IN : line.section !== lines[i - 1].section ? 0.5 + rand() * 0.15 : 0.18 + rand() * 0.2;
    if (i > 0 && t + pause + clip.length / rate > maxEnd) break;
    if (i > 0) t += pause;
    parts.push(new Float32Array(Math.round(pause * rate)), clip);
    starts.push(t);
    t += clip.length / rate;
    ends.push(t);
  }
  parts.push(new Float32Array(Math.round(0.4 * rate)));
  const wavPath = path.join(dir, 'voice.wav');
  writeWav(wavPath, concat(parts), rate);
  return {wavPath, starts, ends, speechEnd: t};
}

/** Words Whisper heard in the voiceover (faster-whisper). Throws if it cannot run. */
export function hear(wavPath: string, outJson: string): Heard[] {
  const r = spawnSync(PYTHON, [path.join(FOOTAGE_DIR, 'captions.py'), wavPath, outJson], {encoding: 'utf8', timeout: 900000, env: {...process.env, HF_HOME: process.env.HF_HOME ?? path.join(MODELS_DIR, 'hf')}});
  if (r.status !== 0) throw new Error(`faster-whisper failed: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()}`);
  return JSON.parse(fs.readFileSync(outJson, 'utf8'));
}

/**
 * Caption words: the script's own words (always spelled right) with the times Whisper heard.
 * Without Whisper, each line's words are spread over the line by length.
 */
export function captionWords(lines: Line[], v: Voiceover, heard: Heard[] | null): Word[] {
  const out: Word[] = [];
  lines.forEach((line, i) => {
    const script = line.text.split(/\s+/).filter(Boolean);
    const mine = (heard ?? []).filter((h) => h.start >= v.starts[i] - 0.15 && h.start < v.ends[i] + 0.1).map((h) => ({...h, start: h.start - v.starts[i], end: h.end - v.starts[i]}));
    for (const w of alignWords(script, mine, 0, v.ends[i] - v.starts[i])) out.push({text: w.text, start: w.start + v.starts[i], end: w.end + v.starts[i]});
  });
  return out;
}
