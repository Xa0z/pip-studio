import {describe, expect, it} from 'vitest';
import {findPatterns, isExperiment, MIN_VIDEOS_FOR_PATTERNS, plannerHints} from '../studio/lib/patterns';

const video = (i: number, hook: string, score: number) => ({id: `v${i}`, features: {hook_type: hook, niche: 'science', local_hour: 20, length_s: 62}, score});

describe('winning patterns', () => {
  it('finds what the top 20% share and the bottom 20% do not', () => {
    const vids = [
      ...Array.from({length: 10}, (_, i) => video(i, 'shock', 1000 + i * 50)),
      ...Array.from({length: 10}, (_, i) => video(10 + i, 'question', 100 + i * 10)),
    ];
    const r = findPatterns(vids);
    expect(r.tooSmall).toBe(false);
    const shock = r.items.find((x) => x.feature === 'hook_type' && x.value === 'shock')!;
    expect(shock.lift).toBeGreaterThan(1.5);
    expect(shock.inTop).toBe(4);
    expect(shock.inBottom).toBe(0);
    // every video has niche=science, so it tells us nothing and is left out
    expect(r.items.some((x) => x.feature === 'niche')).toBe(false);
    const hints = plannerHints(r.items, r.tooSmall);
    expect(hints.some((h) => h.startsWith('Do more') && /shock/i.test(h))).toBe(true);
  });

  it('says honestly when there are fewer than 15 videos', () => {
    const vids = Array.from({length: 6}, (_, i) => video(i, i < 3 ? 'shock' : 'myth', i < 3 ? 900 : 100));
    const r = findPatterns(vids);
    expect(MIN_VIDEOS_FOR_PATTERNS).toBe(15);
    expect(r.tooSmall).toBe(true);
    const hints = plannerHints(r.items, true);
    expect(hints[0]).toMatch(/fewer than 15/);
  });

  it('every 5th video is an experiment (20%)', () => {
    const flags = Array.from({length: 20}, (_, i) => isExperiment(i));
    expect(flags.filter(Boolean)).toHaveLength(4);
    expect(flags[4]).toBe(true);
    expect(flags[0]).toBe(false);
  });
});
