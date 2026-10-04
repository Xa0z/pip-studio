/**
 * Voice: Kokoro TTS (free, runs locally) + Whisper (word timestamps).
 * Each scene is spoken separately, then joined with short pauses, so scene start
 * times are exact. Whisper finds where each word is; subtitles use the script words.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {alignWords, Heard} from './align.js';
import {config, MODELS_DIR} from './config.js';
import {log} from './log.js';
import {countWords, Plan, Scene, Word} from './schema.js';
import {concat, resample, trimSilence, writeWav} from './wav.js';

export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const WHISPER_VERSION = '1.5.5';
const LEAD_IN = 0.15; // seconds of silence before the hook
const SCENE_GAP = 0.3; // shortest pause between scenes
const MAX_SCENE_GAP = 1.0; // longest pause between scenes when stretching to fit

export type VoiceResult = {
  wavPath: string;
  words: Word[];
  sceneStarts: number[]; // seconds
  sceneEnds: number[];
  speechEnd: number; // seconds, end of the last spoken word
  speed: number;
};

type Synth = (text: string, voice: string, speed: number) => Promise<{samples: Float32Array; rate: number}>;

// ---------- Kokoro ----------
let kokoro: any = null;
async function kokoroSynth(text: string, voice: string, speed: number) {
  if (!kokoro) {
    const {env} = await import('@huggingface/transformers');
    env.cacheDir = path.join(MODELS_DIR, 'kokoro');
    const {KokoroTTS} = await import('kokoro-js');
    log.info(`Loading Kokoro model (${KOKORO_MODEL}), cached in ${env.cacheDir}`);
    kokoro = await KokoroTTS.from_pretrained(KOKORO_MODEL, {dtype: 'q8', device: 'cpu'});
  }
  const audio = await kokoro.generate(text, {voice, speed});
  return {samples: audio.audio as Float32Array, rate: audio.sampling_rate as number};
}

// ---------- Fake voice for tests (silence + estimated timings) ----------
async function fakeSynth(text: string, _voice: string, speed: number) {
  const rate = 24000;
  const secs = (countWords(text) * 0.35) / speed + 0.1;
  const samples = new Float32Array(Math.floor(secs * rate));
  for (let i = 0; i < samples.length; i++) samples[i] = 0.02 * Math.sin(i / 8); // quiet tone so trimming keeps it
  return {samples, rate};
}

const provider = (): Synth => (process.env.TTS_PROVIDER === 'fake' ? fakeSynth : kokoroSynth);

// ---------- Whisper ----------
let whisperReady: {whisperPath: string; modelFolder: string} | null = null;
async function ensureWhisper() {
  if (whisperReady) return whisperReady;
  const {installWhisperCpp, downloadWhisperModel} = await import('@remotion/install-whisper-cpp');
  const whisperPath = path.join(MODELS_DIR, 'whisper.cpp');
  const modelFolder = path.join(MODELS_DIR, 'whisper-models');
  fs.mkdirSync(modelFolder, {recursive: true});
  const a = await installWhisperCpp({to: whisperPath, version: WHISPER_VERSION, printOutput: false});
  const b = await downloadWhisperModel({model: config.WHISPER_MODEL, folder: modelFolder, printOutput: false});
  log.info(`Whisper ready (${a.alreadyExisted ? 'cached' : 'installed'}, model ${config.WHISPER_MODEL} ${b.alreadyExisted ? 'cached' : 'downloaded'})`);
  whisperReady = {whisperPath, modelFolder};
  return whisperReady;
}

async function hear(samples: Float32Array, rate: number): Promise<Heard[]> {
  const {whisperPath, modelFolder} = await ensureWhisper();
  const {transcribe, toCaptions} = await import('@remotion/install-whisper-cpp');
  const tmp = path.join(os.tmpdir(), `pip-clip-${process.pid}-${Date.now()}.wav`);
  writeWav(tmp, resample(samples, rate, 16000), 16000);
  try {
    const out = await transcribe({
      inputPath: tmp,
      whisperPath,
      whisperCppVersion: WHISPER_VERSION,
      model: config.WHISPER_MODEL,
      modelFolder,
      tokenLevelTimestamps: true,
      splitOnWord: true,
      language: 'en',
      printOutput: false,
    });
    return toCaptions({whisperCppOutput: out})
      .captions.filter((c) => c.text.trim() && !/^\[.*\]$/.test(c.text.trim()))
      .map((c) => ({text: c.text.trim(), start: c.startMs / 1000, end: c.endMs / 1000}));
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}

/**
 * Pause after each scene (all but the last). Without a target they are all 0.3 s. With one, they grow
 * evenly (up to 1 s) until the speech ends at the target, but a pause never makes its scene longer than 7.8 s.
 */
export function pausesFor(durs: number[], targetEnd?: number): number[] {
  const n = durs.length - 1;
  if (n <= 0) return [];
  if (targetEnd === undefined) return Array(n).fill(SCENE_GAP);
  const caps = durs.slice(0, n).map((d, i) => Math.min(MAX_SCENE_GAP, Math.max(SCENE_GAP, 7.8 - d - (i === 0 ? LEAD_IN : 0))));
  const need = targetEnd - LEAD_IN - durs.reduce((a, b) => a + b, 0);
  const total = (level: number) => caps.reduce((sum, c) => sum + Math.min(c, Math.max(SCENE_GAP, level)), 0);
  let lo = SCENE_GAP;
  let hi = MAX_SCENE_GAP;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (total(mid) < need) lo = mid;
    else hi = mid;
  }
  return caps.map((c) => Math.min(c, Math.max(SCENE_GAP, lo)));
}

/**
 * Speaks every scene, joins them, and returns exact timings.
 * With `targetEnd` (seconds), the pauses between scenes are stretched (see pausesFor) so the speech
 * ends as close to that time as possible. Kokoro talks fast, so this gives the voice room to breathe.
 */
export async function synthesize(
  plan: Pick<Plan, 'scenes'> | {scenes: Scene[]},
  outDir: string,
  speed: number,
  voice = config.PIP_VOICE,
  targetEnd?: number,
): Promise<VoiceResult> {
  const synth = provider();
  const fake = process.env.TTS_PROVIDER === 'fake';
  let rate = 24000;
  const clips: {clip: Float32Array; dur: number; script: string[]; heard: Heard[]}[] = [];
  for (const scene of plan.scenes) {
    const res = await synth(scene.narration, voice, speed);
    rate = res.rate;
    const clip = trimSilence(res.samples, rate);
    clips.push({clip, dur: clip.length / rate, script: scene.narration.trim().split(/\s+/), heard: fake ? [] : await hear(clip, rate)});
  }

  const pauses = pausesFor(clips.map((c) => c.dur), targetEnd);

  const parts: Float32Array[] = [];
  const words: Word[] = [];
  const sceneStarts: number[] = [];
  const sceneEnds: number[] = [];
  let t = LEAD_IN;
  for (const [i, c] of clips.entries()) {
    const pause = i === 0 ? LEAD_IN : pauses[i - 1];
    parts.push(new Float32Array(Math.round(pause * rate)), c.clip);
    if (i > 0) t += pause;
    sceneStarts.push(t);
    for (const w of alignWords(c.script, c.heard, 0, c.dur)) words.push({text: w.text, start: t + w.start, end: t + w.end});
    t += c.dur;
    sceneEnds.push(t);
  }

  const wavPath = path.join(outDir, 'voice.wav');
  writeWav(wavPath, concat(parts), rate);
  return {wavPath, words, sceneStarts, sceneEnds, speechEnd: t, speed};
}

/** Short line in a few voices so the owner can pick Pip's voice. */
export async function voiceSample(text: string, voice: string, file: string, speed = config.VOICE_SPEED) {
  const {samples, rate} = await provider()(text, voice, speed);
  writeWav(file, trimSilence(samples, rate), rate);
  return samples.length / rate;
}
