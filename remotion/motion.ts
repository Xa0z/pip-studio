import {Easing, interpolate, spring} from 'remotion';
import type {VideoStyle} from '../src/styles';

/**
 * Shared motion vocabulary, following Remotion's animation guidance: every movement is
 * driven by the frame, eased with a bezier "expo out" or a spring, and kept short.
 */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0 -> 1 over `dur` frames starting at `start`. */
export const prog = (frame: number, start: number, dur: number, easing = EASE_OUT) =>
  interpolate(frame, [start, start + dur], [0, 1], {...CLAMP, easing});

/** A lively spring that overshoots a little, for things that "pop". */
export const pop = (frame: number, fps: number, delay = 0, damping = 11) =>
  spring({frame: frame - delay, fps, config: {damping, mass: 0.55, stiffness: 170}});

/** A spring with no bounce, for things that "push" into place. */
export const push = (frame: number, fps: number, delay = 0) =>
  spring({frame: frame - delay, fps, config: {damping: 200}, durationInFrames: 18});

/** Fast in, hold, fast out: a short punch, e.g. when a counter lands. */
export const punch = (frame: number, at: number, amount = 0.08, dur = 10) =>
  1 + amount * interpolate(frame, [at, at + 3, at + dur], [0, 1, 0], {...CLAMP, easing: EASE_OUT});

/** How a scene enters and leaves. Each video style has its own family of cuts, cycled so cuts never repeat back to back. */
export type TransitionKind = 'push' | 'wipe' | 'zoom' | 'lift' | 'flip' | 'iris';
export const CUT_FAMILIES: Record<VideoStyle['cuts'], TransitionKind[]> = {
  classic: ['push', 'wipe', 'zoom'],
  slide: ['lift', 'wipe', 'push'],
  flip: ['flip', 'zoom', 'push'],
  iris: ['iris', 'lift', 'zoom'],
};
export const TRANSITIONS = CUT_FAMILIES.classic;
export const transitionFor = (sceneIndex: number, cuts: VideoStyle['cuts'] = 'classic'): TransitionKind => {
  const family = CUT_FAMILIES[cuts] ?? CUT_FAMILIES.classic;
  return family[(sceneIndex + 2) % family.length];
};

export const ENTER_FRAMES = 12;
export const EXIT_FRAMES = 8;
export const WIPE_FRAMES = 14;
