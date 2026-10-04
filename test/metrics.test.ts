import {describe, expect, it} from 'vitest';
import {
  CHECKPOINTS, dailyAccount, dailyTotals, dayKeys, dueCheckpoint, engagementRate, growth, heatmap, median, monthTable, sumLast,
  valueAt, velocity24h, viralScores, VIRAL_RATIO, type Snapshot,
} from '../studio/lib/metrics';
import {goalScore} from '../studio/lib/goals';

const H = 3600_000;
const t0 = new Date('2026-10-01T09:00:00Z');
const snap = (hoursAfter: number, views: number, likes = 0, checkpoint = 'x', comments = 0, shares = 0): Snapshot => ({
  checkpoint, captured_at: new Date(t0.getTime() + hoursAfter * H).toISOString(), views, likes, comments, shares,
});

describe('engagement and velocity', () => {
  it('engagement = (likes + comments + shares) / views', () => {
    expect(engagementRate({views: 1000, likes: 80, comments: 15, shares: 5})).toBeCloseTo(0.1);
    expect(engagementRate({views: 0, likes: 3, comments: 0, shares: 0})).toBe(0);
  });

  it('24h velocity comes from the 24h snapshot only', () => {
    expect(velocity24h([snap(1, 50, 0, '1h'), snap(6, 300, 0, '6h')])).toBeNull();
    expect(velocity24h([snap(1, 50, 0, '1h'), snap(24, 2400, 0, '24h'), snap(72, 5000, 0, '3d')])).toBe(2400);
  });

  it('median', () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('viral score', () => {
  it('is views vs the user median; 3x or more is viral', () => {
    const s = viralScores([{id: 'a', views: 100}, {id: 'b', views: 120}, {id: 'c', views: 90}, {id: 'd', views: 360}, {id: 'e', views: 299}]);
    expect(s.get('b')!.ratio).toBeCloseTo(1);
    expect(s.get('d')).toEqual({ratio: 3, viral: true});
    expect(s.get('e')!.viral).toBe(false);
    expect(VIRAL_RATIO).toBe(3);
  });

  it('says nothing with fewer than 3 videos or a zero median', () => {
    expect(viralScores([{id: 'a', views: 10}, {id: 'b', views: 1000}]).get('b')).toEqual({ratio: null, viral: false});
    expect(viralScores([{id: 'a', views: 0}, {id: 'b', views: 0}, {id: 'c', views: 50}]).get('c')!.viral).toBe(false);
  });
});

describe('snapshot schedule', () => {
  const have = new Set<string>();
  const at = (h: number) => new Date(t0.getTime() + h * H);

  it('has 1h, 6h, 24h, 3d, 7d then daily to day 30', () => {
    expect(CHECKPOINTS.slice(0, 5).map((c) => c.name)).toEqual(['1h', '6h', '24h', '3d', '7d']);
    expect(CHECKPOINTS.at(-1)).toEqual({name: 'd30', hours: 720});
    expect(CHECKPOINTS.length).toBe(28);
  });

  it('takes each checkpoint when it is due', () => {
    expect(dueCheckpoint(t0, at(0.5), have)).toBeNull();
    expect(dueCheckpoint(t0, at(1.1), have)).toBe('1h');
    expect(dueCheckpoint(t0, at(6.2), have)).toBe('6h');
    expect(dueCheckpoint(t0, at(24.3), have)).toBe('24h');
    expect(dueCheckpoint(t0, at(72.1), have)).toBe('3d');
    expect(dueCheckpoint(t0, at(168.2), have)).toBe('7d');
    expect(dueCheckpoint(t0, at(8 * 24 + 1), have)).toBe('d8');
    expect(dueCheckpoint(t0, at(30 * 24 + 1), have)).toBe('d30');
    expect(dueCheckpoint(t0, at(40 * 24), have)).toBeNull();
  });

  it('does not repeat a checkpoint and does not save a late one under the wrong name', () => {
    expect(dueCheckpoint(t0, at(1.2), new Set(['1h']))).toBeNull();
    expect(dueCheckpoint(t0, at(20), have)).toBeNull(); // "6h" is far too late now; wait for 24h
  });
});

describe('daily totals and growth', () => {
  const tz = 'Asia/Baghdad';
  const days = dayKeys(new Date('2026-10-01T00:00:00+03:00'), new Date('2026-10-03T23:00:00+03:00'), tz);

  it('lists local days', () => {
    expect(days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('counts views gained per day, not totals', () => {
    // video posted 2026-10-01 12:00 Baghdad (09:00 UTC)
    const snaps = [snap(1, 100, 10), snap(6, 400, 30), snap(24, 1000, 70), snap(48, 1300, 80)];
    const d = dailyTotals([{snaps}], days, tz);
    expect(d.map((x) => x.views)).toEqual([400, 600, 300]);
    expect(d.map((x) => x.likes)).toEqual([30, 40, 10]);
    expect(d.reduce((n, x) => n + x.views, 0)).toBe(valueAt(snaps, new Date('2026-10-04T00:00:00+03:00'), 'views'));
  });

  it('followers per day and new followers', () => {
    const acct = [
      {captured_at: '2026-10-01T06:00:00Z', followers: 100, following: 0, likes: 0, video_count: 0},
      {captured_at: '2026-10-02T06:00:00Z', followers: 130, following: 0, likes: 0, video_count: 1},
      {captured_at: '2026-10-03T18:00:00Z', followers: 125, following: 0, likes: 0, video_count: 2},
    ];
    const a = dailyAccount(acct, days, tz);
    expect(a.map((x) => x.followers)).toEqual([100, 130, 125]);
    expect(a.map((x) => x.newFollowers)).toEqual([0, 30, -5]);
  });

  it('growth over day / week / month', () => {
    const series = Array.from({length: 40}, (_, i) => 100 + i * 10);
    expect(growth(series)).toEqual({day: 10, week: 70, month: 300});
    expect(growth([5])).toEqual({day: 0, week: 0, month: 0});
    expect(sumLast([1, 2, 3, 4], 2)).toBe(7);
  });

  it('month table', () => {
    const rows = monthTable(
      [{day: '2026-09-30', views: 10, likes: 1, comments: 0, shares: 0}, {day: '2026-10-01', views: 20, likes: 2, comments: 1, shares: 1}, {day: '2026-10-02', views: 5, likes: 0, comments: 0, shares: 0}],
      [{day: '2026-09-30', followers: 50, likes: 0, videoCount: 0, newFollowers: 3}, {day: '2026-10-01', followers: 60, likes: 0, videoCount: 0, newFollowers: 10}],
      ['2026-10-01', '2026-10-02', '2026-09-30'],
    );
    expect(rows[0]).toEqual({month: '2026-10', views: 25, likes: 2, comments: 1, shares: 1, newFollowers: 10, videosPosted: 2});
    expect(rows[1].month).toBe('2026-09');
  });

  it('heatmap uses median per weekday and hour', () => {
    const h = heatmap([{weekday: 1, hour: 20, score: 10}, {weekday: 1, hour: 20, score: 30}, {weekday: 1, hour: 20, score: 20}]);
    expect(h[1][20]).toBe(20);
    expect(h[0][0]).toBeNull();
    expect(h.length).toBe(7);
    expect(h[0].length).toBe(24);
  });
});

describe('goal scores', () => {
  const m = {views: 1000, likes: 100, comments: 20, shares: 10};
  it('changes with the goal', () => {
    expect(goalScore('views', m)).toBeGreaterThan(0);
    expect(goalScore('followers', m)).not.toBe(goalScore('views', m));
  });
});
