import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATEGORIES, Category} from './schema.js';

export const HISTORY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'history.json');

export type HistoryEntry = {
  episode: number;
  title: string;
  date: string; // ISO time it was published (or attempted)
  slot: string; // e.g. "09:00"
  category: Category;
  topic: string;
  mainFact: string;
  caption: string;
  hashtags: string[];
  source: string;
  status: 'published' | 'inbox' | 'failed';
  publishId?: string;
  privacy?: string;
};

export type History = {nextEpisode: number; videos: HistoryEntry[]};

export const loadHistory = (): History => {
  if (!fs.existsSync(HISTORY_PATH)) return {nextEpisode: 1, videos: []};
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) as History;
};

export const saveHistory = (h: History) => fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2) + '\n');

/** Next category in a fixed rotation, so the same category never runs twice in a row. */
export const nextCategory = (last: Category | undefined): Category => {
  if (!last) return CATEGORIES[0];
  return CATEGORIES[(CATEGORIES.indexOf(last) + 1) % CATEGORIES.length];
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'your', 'you', 'are', 'for', 'with', 'that', 'can', 'how', 'why', 'what', 'its', 'has', 'have', 'than', 'from', 'into']);

/** True if a new topic is the same as, or very close to, an earlier one. */
export const isRepeatTopic = (topic: string, past: string[]): string | null => {
  const a = new Set(norm(topic));
  for (const p of past) {
    const b = new Set(norm(p));
    if (!a.size || !b.size) continue;
    const inter = [...a].filter((w) => b.has(w)).length;
    const jaccard = inter / new Set([...a, ...b]).size;
    if (jaccard >= 0.6) return p;
  }
  return null;
};
