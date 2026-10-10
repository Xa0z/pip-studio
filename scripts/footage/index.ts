/**
 * Finds the best footage for each shot.
 * Main path: OpenCLIP (scripts/footage/clip.py) compares the shot's words with every indexed photo and clip shot.
 * Fallback when Python or the model is missing: plain word overlap with each file's tags (source title + search words).
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {log} from '../../src/log.js';
import {FOOTAGE_DIR, Library, PYTHON} from './paths.js';
import type {MediaItem} from './scan.js';

export type Segment = {start: number; end: number};
export type IndexItem = MediaItem & {segments: Segment[]};
export type Candidate = {file: string; seg: number; score: number};
export type Matcher = 'clip' | 'keywords';

/** Cosine similarity below this means "nothing in the library fits" (OpenCLIP ViT-B-32 text-to-image scale). */
export const MIN_SCORE: Record<Matcher, number> = {clip: 0.22, keywords: 0.2};

function py(args: string[], input?: string, timeout = 1800000) {
  const r = spawnSync(PYTHON, [path.join(FOOTAGE_DIR, 'clip.py'), ...args], {input, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']});
  if (r.stderr) for (const line of r.stderr.trim().split('\n').slice(-12)) if (line.startsWith('[clip]')) log.info(line);
  if (r.status !== 0) throw new Error(`clip.py ${args[0]} failed: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()}`);
  return JSON.parse(r.stdout.trim().split('\n').pop() || '{}');
}

/** Embeds new library files. Returns false if OpenCLIP cannot run here (then keyword matching is used). */
export function buildIndex(l: Library): boolean {
  if (process.env.REALEDIT_MATCHER === 'keywords') return false;
  const r = py(['index', '--library', l.root]);
  log.info(`OpenCLIP index: ${r.indexed} new, ${r.total} total`);
  return true;
}

export function readIndex(l: Library, matcher: Matcher): IndexItem[] {
  const media: MediaItem[] = JSON.parse(fs.readFileSync(l.media, 'utf8')).items;
  if (matcher === 'clip' && fs.existsSync(l.index)) {
    const idx = new Map((JSON.parse(fs.readFileSync(l.index, 'utf8')).items as IndexItem[]).map((e) => [e.file, e]));
    return media.flatMap((m) => {
      const e = idx.get(m.file);
      return e ? [{...m, segments: e.segments.map((s) => ({start: s.start, end: s.end}))}] : [];
    });
  }
  // Without the index: photos are one segment, clips are cut into 4 s pieces.
  return media.map((m) => ({...m, segments: m.kind === 'photo' ? [{start: 0, end: 0}] : Array.from({length: Math.max(1, Math.floor(m.duration / 4))}, (_, i) => ({start: i * 4, end: Math.min(m.duration, i * 4 + 4)}))}));
}

const STOP = new Set(
  'a an the and or but if of to in on at by for with from into onto over under about as is are was were be been being it its this that these those there here than then so very can could will would should may might just also not no yes you your we our they their he she his her i me my what which who whom how why when where do does did have has had more most many much some any each every all few one two three first next only even still such own same other into out up down off again once while because through during before after above below between'.split(
    ' ',
  ),
);

export const keywordsOf = (text: string, max = 4) => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const seen: string[] = [];
  for (const w of words) if (!seen.includes(w)) seen.push(w);
  // Longer words tend to be the concrete nouns ("lighthouse", "octopus").
  return seen.sort((a, b) => b.length - a.length).slice(0, max);
};

const stem = (w: string) => w.replace(/(ies|es|s|ing|ed)$/, '');

export function keywordScore(query: string, tags: string): number {
  const q = keywordsOf(query, 8).map(stem);
  if (!q.length) return 0;
  const t = new Set(tags.toLowerCase().split(/[^a-z0-9]+/).map(stem));
  return q.filter((w) => t.has(w)).length / q.length;
}

/** Ranked candidates for each query id. */
export function match(l: Library, matcher: Matcher, queries: {id: string; text: string}[], items: IndexItem[]): Record<string, Candidate[]> {
  if (matcher === 'clip') return py(['match', '--library', l.root], JSON.stringify({queries, top: 40})).results;
  const out: Record<string, Candidate[]> = {};
  for (const q of queries) {
    out[q.id] = items
      .flatMap((it) => it.segments.map((_, seg) => ({file: it.file, seg, score: keywordScore(q.text, it.tags)})))
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }
  return out;
}
