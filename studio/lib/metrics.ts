/** Analytics math. Pure functions, no I/O, so they are easy to test. */
import {localParts, localToUtc} from './schedule.js';

export type Counts = {views: number; likes: number; comments: number; shares: number};
export type Snapshot = Counts & {checkpoint: string; captured_at: string};
export type AccountSnapshot = {captured_at: string; followers: number; following: number; likes: number; video_count: number};

// ---------- snapshot schedule ----------
/** 1 h, 6 h, 24 h, 3 days, 7 days, then once a day up to day 30. */
export const CHECKPOINTS: {name: string; hours: number}[] = [
  {name: '1h', hours: 1},
  {name: '6h', hours: 6},
  {name: '24h', hours: 24},
  {name: '3d', hours: 72},
  {name: '7d', hours: 168},
  ...Array.from({length: 23}, (_, i) => ({name: `d${i + 8}`, hours: (i + 8) * 24})),
];

/**
 * The checkpoint to capture now, or null. Only the latest due checkpoint is taken:
 * if the cron missed "6h" and it is now 20 h after posting, nothing is saved as "6h"
 * (that number would be wrong); "24h" is taken when its time comes.
 */
export function dueCheckpoint(postedAt: Date, now: Date, have: Set<string>): string | null {
  const age = (now.getTime() - postedAt.getTime()) / 3600000;
  for (let i = CHECKPOINTS.length - 1; i >= 0; i--) {
    const c = CHECKPOINTS[i];
    if (age < c.hours) continue;
    const next = CHECKPOINTS[i + 1];
    // Window: until the next checkpoint, but at most 12 h late for daily ones and 50% late for early ones.
    const lateLimit = Math.min(next ? next.hours : c.hours + 24, c.hours + Math.max(0.5, Math.min(12, c.hours * 0.5)));
    if (age > lateLimit) return null;
    return have.has(c.name) ? null : c.name;
  }
  return null;
}

// ---------- per video ----------
export const engagementRate = (m: Counts) => (m.views > 0 ? (m.likes + m.comments + m.shares) / m.views : 0);

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const latest = (snaps: Snapshot[]): Snapshot | null =>
  snaps.length ? snaps.reduce((a, b) => (new Date(b.captured_at) > new Date(a.captured_at) ? b : a)) : null;

/** View velocity = views in the first 24 h (the "24h" snapshot). Null until it exists. */
export const velocity24h = (snaps: Snapshot[]) => snaps.find((s) => s.checkpoint === '24h')?.views ?? null;

export type ViralInfo = {ratio: number | null; viral: boolean};

/** Each video vs the user's own median views. 3x or more = viral. Needs at least 3 videos with numbers. */
export const VIRAL_RATIO = 3;
export const MIN_VIDEOS_FOR_VIRAL = 3;
export function viralScores(videos: {id: string; views: number}[]): Map<string, ViralInfo> {
  const out = new Map<string, ViralInfo>();
  const med = median(videos.map((v) => v.views));
  const enough = videos.length >= MIN_VIDEOS_FOR_VIRAL && med > 0;
  for (const v of videos) {
    const ratio = enough ? v.views / med : null;
    out.set(v.id, {ratio, viral: ratio !== null && ratio >= VIRAL_RATIO});
  }
  return out;
}

// ---------- over time ----------
/** Local calendar days (YYYY-MM-DD) from `from` to `to`, in the user's time zone. */
export function dayKeys(from: Date, to: Date, tz: string): string[] {
  const out: string[] = [];
  const a = localParts(from, tz);
  for (let i = 0; i < 4000; i++) {
    const start = localToUtc(a.y, a.m, a.d + i, '00:00', tz);
    if (start > to) break;
    const p = localParts(new Date(start.getTime() + 3600000), tz);
    out.push(`${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`);
  }
  return out;
}

const dayEnd = (day: string, tz: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return localToUtc(y, m - 1, d + 1, '00:00', tz);
};

/** Value of a counter at time t: the last snapshot at or before t (step function), 0 before the first one. */
export function valueAt<T extends {captured_at: string}>(snaps: T[], t: Date, key: keyof T): number {
  let best: T | null = null;
  for (const s of snaps) if (new Date(s.captured_at) <= t && (!best || new Date(s.captured_at) > new Date(best.captured_at))) best = s;
  return best ? Number(best[key]) : 0;
}

export type DailyCounts = Counts & {day: string};

/** Views, likes, comments and shares gained per day, summed over all videos. */
export function dailyTotals(videos: {snaps: Snapshot[]}[], days: string[], tz: string): DailyCounts[] {
  const keys: (keyof Counts)[] = ['views', 'likes', 'comments', 'shares'];
  return days.map((day, i) => {
    const end = dayEnd(day, tz);
    const prevEnd = i > 0 ? dayEnd(days[i - 1], tz) : new Date(end.getTime() - 86400000);
    const row: DailyCounts = {day, views: 0, likes: 0, comments: 0, shares: 0};
    for (const v of videos) for (const k of keys) row[k] += Math.max(0, valueAt(v.snaps, end, k) - valueAt(v.snaps, prevEnd, k));
    return row;
  });
}

export type DailyAccount = {day: string; followers: number; likes: number; videoCount: number; newFollowers: number};

/** Followers at the end of each day and the change from the day before. Days before the first snapshot carry no data. */
export function dailyAccount(snaps: AccountSnapshot[], days: string[], tz: string): DailyAccount[] {
  const first = snaps.length ? Math.min(...snaps.map((s) => new Date(s.captured_at).getTime())) : Infinity;
  let prev: number | null = null;
  return days.map((day) => {
    const end = dayEnd(day, tz);
    const has = end.getTime() > first;
    const followers = has ? valueAt(snaps, end, 'followers') : 0;
    const row = {day, followers, likes: has ? valueAt(snaps, end, 'likes') : 0, videoCount: has ? valueAt(snaps, end, 'video_count') : 0, newFollowers: has && prev !== null ? followers - prev : 0};
    if (has) prev = followers;
    return row;
  });
}

/** Change over the last 1, 7 and 30 days. */
export function growth(series: number[]): {day: number; week: number; month: number} {
  const last = series.at(-1) ?? 0;
  const back = (n: number) => series[Math.max(0, series.length - 1 - n)] ?? 0;
  return {day: last - back(1), week: last - back(7), month: last - back(30)};
}

/** Sum of a gained-per-day series over the last n days. */
export const sumLast = (series: number[], n: number) => series.slice(-n).reduce((a, b) => a + b, 0);

export type MonthRow = Counts & {month: string; newFollowers: number; videosPosted: number};

export function monthTable(daily: DailyCounts[], account: DailyAccount[], postedDays: string[]): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  const get = (month: string) => {
    if (!rows.has(month)) rows.set(month, {month, views: 0, likes: 0, comments: 0, shares: 0, newFollowers: 0, videosPosted: 0});
    return rows.get(month)!;
  };
  for (const d of daily) {
    const r = get(d.day.slice(0, 7));
    r.views += d.views;
    r.likes += d.likes;
    r.comments += d.comments;
    r.shares += d.shares;
  }
  for (const a of account) get(a.day.slice(0, 7)).newFollowers += a.newFollowers;
  for (const p of postedDays) get(p.slice(0, 7)).videosPosted += 1;
  return [...rows.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** Median score by weekday (0 = Sunday) and local hour. null = no videos in that cell. */
export function heatmap(items: {weekday: number; hour: number; score: number}[]): (number | null)[][] {
  const cells: number[][][] = Array.from({length: 7}, () => Array.from({length: 24}, () => [] as number[]));
  for (const it of items) cells[it.weekday]?.[it.hour]?.push(it.score);
  return cells.map((row) => row.map((c) => (c.length ? median(c) : null)));
}

export const fmtNum = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(Math.round(n));
export const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;
