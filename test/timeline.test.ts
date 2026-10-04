import {describe, expect, it} from 'vitest';
import {buildTimeline, DEFAULT_SPEC, FPS, lengthSpec, MAX_SCENE_FRAMES, validateTimeline, wordRange} from '../src/timeline';
import {GOALS, pickLength} from '../studio/lib/goals';
import {sceneRange, studioPlanSchema} from '../studio/lib/plan-schema';
import {planAnswer} from '../studio/dev/fixtures';

const scenes = (n: number) => Array.from({length: n}, (_, i) => ({narration: `scene ${i}`}) as any);

describe('timeline math', () => {
  it('length spec for any length from 30 to 62 seconds', () => {
    expect(lengthSpec(62)).toEqual({totalFrames: 1860, speechMin: 58, speechMax: 61});
    expect(lengthSpec(45)).toEqual({totalFrames: 1350, speechMin: 41, speechMax: 44});
    expect(lengthSpec(10).totalFrames).toBe(30 * FPS); // clamped to 30 s
    expect(lengthSpec(90).totalFrames).toBe(62 * FPS); // clamped to 62 s
    expect(DEFAULT_SPEC).toEqual(lengthSpec(62));
  });

  it('word ranges grow with length', () => {
    expect(wordRange(62)).toEqual({min: 145, max: 168});
    expect(wordRange(30)).toEqual({min: 65, max: 80});
    expect(wordRange(45).min).toBeGreaterThan(wordRange(30).max - 20);
  });

  it('scenes fill the video exactly, with no gaps', () => {
    for (const seconds of [30, 40, 45, 55, 62]) {
      const spec = lengthSpec(seconds);
      const n = sceneRange(seconds).max;
      const step = spec.speechMax / n;
      const starts = Array.from({length: n}, (_, i) => i * step);
      const t = buildTimeline({scenes: scenes(n)}, {sceneStarts: starts}, spec);
      expect(t.reduce((s, x) => s + x.durationInFrames, 0)).toBe(spec.totalFrames);
      expect(t[0].from).toBe(0);
      t.forEach((x, i) => i > 0 && expect(x.from).toBe(t[i - 1].from + t[i - 1].durationInFrames));
      // scenes start 3 frames before their first word
      expect(t[1].from).toBe(Math.round(starts[1] * FPS) - 3);
      expect(() => validateTimeline(t, spec, n)).not.toThrow();
    }
  });

  it('validation catches too long scenes and wrong totals', () => {
    const spec = lengthSpec(30);
    const t = buildTimeline({scenes: scenes(6)}, {sceneStarts: [0, 1, 2, 3, 4, 5]}, spec);
    expect(t.at(-1)!.durationInFrames).toBeGreaterThan(MAX_SCENE_FRAMES);
    expect(() => validateTimeline(t, spec, 6)).toThrow(/max 240/);
    const short = t.slice(0, 5);
    expect(() => validateTimeline(short, spec, 6)).toThrow(/5 scenes/);
  });

  it('goal decides length: Creator Rewards is always 62 s, the others vary in 5 s steps', () => {
    for (let seed = 0; seed < 10; seed++) expect(pickLength('creator_rewards', seed)).toBe(62);
    const lens = new Set(Array.from({length: 20}, (_, s) => pickLength('followers', s)));
    const [a, b] = GOALS.followers.length;
    for (const l of lens) {
      expect(l).toBeGreaterThanOrEqual(a);
      expect(l).toBeLessThanOrEqual(b);
      expect((l - a) % 5).toBe(0);
    }
    expect(lens.size).toBeGreaterThan(1);
  });

  it('plan schema checks hook, recap, CTA and word count', () => {
    const plan = JSON.parse(planAnswer('Nova'));
    expect(studioPlanSchema({seconds: 62, cta: 'follow'}).safeParse(plan).success).toBe(true);
    const r = studioPlanSchema({seconds: 62, cta: 'comment'}).safeParse(plan);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/comment/);
    const short = studioPlanSchema({seconds: 30, cta: 'follow'}).safeParse(plan);
    expect(JSON.stringify(short.error?.issues)).toMatch(/words/);
  });
});
