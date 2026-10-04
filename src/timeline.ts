import type {Plan, TimedScene} from './schema.js';
import type {VoiceResult} from './voice.js';

export const FPS = 30;
export const TOTAL_FRAMES = 1860; // 62 s (Pip Explains and Creator Rewards videos)
export const MAX_SCENE_FRAMES = 240; // 8 s
export const HOOK_MAX_SECONDS = 3.5;
export const SPEECH_MIN = 58;
export const SPEECH_MAX = 61;
export const MIN_SECONDS = 30;
export const MAX_SECONDS = 62;

/** How long a video is and how long its speech must be. */
export type LengthSpec = {totalFrames: number; speechMin: number; speechMax: number};

export const DEFAULT_SPEC: LengthSpec = {totalFrames: TOTAL_FRAMES, speechMin: SPEECH_MIN, speechMax: SPEECH_MAX};

/** A video of `seconds` (30 to 62) leaves 1 to 4 s after the last word, like the 62 s format. */
export function lengthSpec(seconds: number): LengthSpec {
  const s = Math.round(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds)));
  return {totalFrames: s * FPS, speechMin: s - 4, speechMax: s - 1};
}

/** Words a script needs for a video of this many seconds (Kokoro speaks about 2.6 words a second). */
export function wordRange(seconds: number): {min: number; max: number} {
  const spec = lengthSpec(seconds);
  return {min: Math.round(spec.speechMin * 2.5), max: Math.round(spec.speechMax * 2.75)};
}

/** Problems that need a rewrite or a speed change (empty = good to render). */
export function voiceProblems(plan: Pick<Plan, 'scenes'>, v: VoiceResult, spec: LengthSpec = DEFAULT_SPEC): string[] {
  const p: string[] = [];
  if (v.speechEnd < spec.speechMin || v.speechEnd > spec.speechMax) {
    p.push(`spoken length is ${v.speechEnd.toFixed(1)} s, it must be ${spec.speechMin} to ${spec.speechMax} s`);
  }
  if (v.sceneEnds[0] > HOOK_MAX_SECONDS) p.push(`the hook takes ${v.sceneEnds[0].toFixed(1)} s to say; it must end by about 3 s, so make it shorter (max 8 short words)`);
  plan.scenes.forEach((s, i) => {
    const isLast = i === plan.scenes.length - 1;
    const end = isLast ? spec.totalFrames / FPS : v.sceneStarts[i + 1];
    const len = end - (i === 0 ? 0 : v.sceneStarts[i]);
    if (len > MAX_SCENE_FRAMES / FPS) p.push(`scene ${i + 1} lasts ${len.toFixed(1)} s, max is 8 s: shorten or split it`);
  });
  return p;
}

/** Scene i starts a few frames before its first word; the CTA scene fills to the last frame. */
export function buildTimeline(plan: Pick<Plan, 'scenes'>, v: Pick<VoiceResult, 'sceneStarts'>, spec: LengthSpec = DEFAULT_SPEC): TimedScene[] {
  const starts = plan.scenes.map((_, i) => (i === 0 ? 0 : Math.max(0, Math.round(v.sceneStarts[i] * FPS) - 3)));
  return plan.scenes.map((s, i) => ({
    ...s,
    from: starts[i],
    durationInFrames: (i + 1 < starts.length ? starts[i + 1] : spec.totalFrames) - starts[i],
  }));
}

/** Hard checks before rendering. Throws with every problem found. */
export function validateTimeline(scenes: TimedScene[], spec: LengthSpec = DEFAULT_SPEC, minScenes = 8) {
  const errors: string[] = [];
  if (scenes.length < minScenes || scenes.length > 12) errors.push(`${scenes.length} scenes (need ${minScenes} to 12)`);
  const sum = scenes.reduce((n, s) => n + s.durationInFrames, 0);
  if (sum !== spec.totalFrames) errors.push(`scene frames add up to ${sum}, not ${spec.totalFrames}`);
  scenes.forEach((s, i) => {
    if (s.durationInFrames <= 0) errors.push(`scene ${i + 1} has no frames`);
    if (s.durationInFrames > MAX_SCENE_FRAMES) errors.push(`scene ${i + 1} is ${s.durationInFrames} frames (max ${MAX_SCENE_FRAMES})`);
    if (i > 0 && s.from !== scenes[i - 1].from + scenes[i - 1].durationInFrames) errors.push(`scene ${i + 1} does not follow scene ${i}`);
  });
  if (scenes[0]?.from !== 0) errors.push('first scene must start at frame 0');
  if (errors.length) throw new Error(`Timeline check failed: ${errors.join('; ')}`);
}
