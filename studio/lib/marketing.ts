/**
 * Marketing video mode: each day the user sends 3 reference videos and what to change,
 * and the next day we make 3 videos in the same style for their business and post them.
 */
import {localParts} from './schedule.js';
import type {MarketingBrief, RefVideo} from './types.js';

export const REFS_PER_DAY = 3;
/** Telegram only lets bots download files up to 20 MB. */
export const MAX_REF_BYTES = 20 * 1024 * 1024;
export const MAX_REF_SECONDS = 180;
/** Ask for tomorrow's references from this local hour on. */
export const ASK_HOUR = 17;
const KEEP_BRIEFS = 7;

const pad = (n: number) => String(n).padStart(2, '0');

/** The local date at `at` in `tz`, as YYYY-MM-DD. */
export const localDay = (at: Date, tz: string) => {
  const p = localParts(at, tz);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
};

/** The local date after `day` (YYYY-MM-DD). */
export const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** "2026-10-07" -> "Tue 7 Oct". */
export const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

/** Saves a brief for its day (replacing one already there) and keeps the last few. */
export function addBrief(briefs: MarketingBrief[] | undefined, brief: MarketingBrief): MarketingBrief[] {
  return [...(briefs ?? []).filter((b) => b.day !== brief.day), brief].sort((a, b) => a.day.localeCompare(b.day)).slice(-KEEP_BRIEFS);
}

/**
 * The brief for a posting day: that day's own, or else the newest earlier one
 * (so posting keeps going on a day the user did not send new references).
 */
export function briefFor(briefs: MarketingBrief[] | undefined, day: string): {brief: MarketingBrief; reused: boolean} | null {
  const list = (briefs ?? []).filter((b) => b.refs.length);
  const exact = list.find((b) => b.day === day);
  if (exact) return {brief: exact, reused: false};
  const earlier = list.filter((b) => b.day < day).at(-1);
  return earlier ? {brief: earlier, reused: true} : null;
}

/** Which reference a slot uses: its place among the day's post times (1st time -> 1st reference). */
export function refIndexForSlot(slot: Date, times: string[], tz: string, refCount: number): number {
  const p = localParts(slot, tz);
  const hhmm = `${pad(p.hour)}:${pad(p.minute)}`;
  const i = [...times].sort().indexOf(hhmm);
  return Math.max(0, i) % Math.max(1, refCount);
}

/** First web link in the user's business text, if any. */
export function linkFrom(text: string): string | null {
  const m = /\b((?:https?:\/\/|www\.)[^\s,;]+|[a-z0-9-]+\.(?:com|net|org|io|co|shop|store|app|me|ai|biz|info|uk|de|pk|in)(?:\/[^\s,;]*)?)/i.exec(text);
  if (!m) return null;
  const url = m[1].replace(/[).!?]+$/, '');
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export type RefCheck = {ok: true; ref: RefVideo} | {ok: false; why: 'too_big' | 'too_long' | 'not_video'};

/** Checks a video (or video file sent as a document) the user sent as a reference. */
export function checkRef(v: {file_id: string; duration?: number; width?: number; height?: number; file_size?: number; mime_type?: string; file_name?: string}): RefCheck {
  if (v.mime_type && !v.mime_type.startsWith('video/')) return {ok: false, why: 'not_video'};
  if ((v.file_size ?? 0) > MAX_REF_BYTES) return {ok: false, why: 'too_big'};
  if ((v.duration ?? 0) > MAX_REF_SECONDS) return {ok: false, why: 'too_long'};
  return {ok: true, ref: {file_id: v.file_id, duration: v.duration ?? 0, width: v.width, height: v.height, file_size: v.file_size, name: v.file_name}};
}

/** Marketing videos are short: 30 s, or 45 s when the reference itself is long. */
export const marketingSeconds = (refDuration: number) => (refDuration > 40 ? 45 : 30);
