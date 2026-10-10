/**
 * Beat times of a music track, so cuts can land on the beat.
 * Decodes with ffmpeg, builds an onset curve (rise in loudness), finds the tempo by autocorrelation,
 * then the beat grid offset that sits on the most onsets.
 */
import {execFileSync} from 'node:child_process';

const RATE = 11025;
const HOP = 256; // ~23 ms

export function onsetCurve(samples: Float32Array): Float32Array {
  const n = Math.floor(samples.length / HOP);
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) e += samples[j] * samples[j];
    energy[i] = Math.log1p(1000 * e);
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  return onset;
}

export function beatsFromOnsets(onset: Float32Array, hopSeconds: number, maxSeconds: number): number[] {
  const n = onset.length;
  if (n < 100) return [];
  // Tempo between 70 and 160 BPM.
  const minLag = Math.round(60 / 160 / hopSeconds);
  const maxLag = Math.round(60 / 70 / hopSeconds);
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    s /= n - lag;
    if (s > bestScore) [bestLag, bestScore] = [lag, s];
  }
  if (!bestLag) return [];
  let bestPhase = 0;
  let phaseScore = -1;
  for (let p = 0; p < bestLag; p++) {
    let s = 0;
    for (let i = p; i < n; i += bestLag) s += onset[i];
    if (s > phaseScore) [bestPhase, phaseScore] = [p, s];
  }
  const out: number[] = [];
  for (let i = bestPhase; i < n && i * hopSeconds <= maxSeconds; i += bestLag) out.push(Math.round(i * hopSeconds * 1000) / 1000);
  return out;
}

/** Beats in the first `maxSeconds` of the file, starting at `offset` seconds into the track. */
export function detectBeats(file: string, maxSeconds: number, offset = 0): number[] {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(offset), '-t', String(maxSeconds + 1), '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], {maxBuffer: 512 * 1024 * 1024, timeout: 120000});
  const len = Math.floor(raw.byteLength / 4) * 4;
  const samples = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + len));
  return beatsFromOnsets(onsetCurve(samples), HOP / RATE, maxSeconds);
}
