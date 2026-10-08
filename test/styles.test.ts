import {describe, expect, it} from 'vitest';
import {CLASSIC_STYLE, isVideoStyle, pickStyle, resolveStyle, seedFrom, styleDistance, type VideoStyle} from '../src/styles';

describe('video styles', () => {
  it('is the same for the same seed, and valid', () => {
    expect(pickStyle(42)).toEqual(pickStyle(42));
    expect(isVideoStyle(pickStyle(seedFrom('video-1')))).toBe(true);
    expect(isVideoStyle({...CLASSIC_STYLE, hook: 'nope'})).toBe(false);
  });

  it('never repeats the most visible choices back to back, and stays different from recent videos', () => {
    const history: VideoStyle[] = [];
    for (let i = 0; i < 60; i++) {
      const s = pickStyle(seedFrom(`v${i}`), history.slice(0, 3));
      const last = history[0];
      if (last) {
        for (const k of ['backdrop', 'headline', 'cuts', 'hook'] as const) expect(s[k]).not.toBe(last[k]);
        expect(styleDistance(s, last)).toBeGreaterThanOrEqual(5);
      }
      history.unshift(s);
    }
    // Over many videos every option shows up, and most videos use some 3D.
    expect(new Set(history.map((s) => s.backdrop)).size).toBe(5);
    expect(new Set(history.map((s) => s.hook)).size).toBe(3);
    expect(history.filter((s) => s.depth !== 'flat').length).toBeGreaterThan(35);
  });

  it('fills gaps from the classic look (old videos have no style)', () => {
    expect(resolveStyle(undefined)).toEqual(CLASSIC_STYLE);
    expect(resolveStyle({cuts: 'flip', hook: 'bogus' as never})).toEqual({...CLASSIC_STYLE, cuts: 'flip'});
  });
});
