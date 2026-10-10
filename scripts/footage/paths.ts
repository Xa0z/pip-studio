import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {log} from '../../src/log.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FOOTAGE_DIR = path.join(ROOT, 'scripts', 'footage');

/** The footage library. Not in git: on GitHub Actions it lives in the Actions cache, so it grows run by run. */
export const lib = (root = process.env.REALEDIT_LIBRARY ? path.resolve(process.env.REALEDIT_LIBRARY) : path.join(ROOT, 'library')) => ({
  root,
  clips: path.join(root, 'clips'),
  photos: path.join(root, 'photos'),
  music: path.join(root, 'music'),
  sfx: path.join(root, 'sfx'),
  luts: path.join(root, 'luts'),
  graded: path.join(root, 'graded'),
  media: path.join(root, 'media.json'),
  index: path.join(root, 'index.json'),
  credits: path.join(root, 'credits.json'),
});
export type Library = ReturnType<typeof lib>;

export const ensureLibrary = (l: Library) => {
  for (const d of [l.clips, l.photos, l.music, l.sfx, l.luts, l.graded]) fs.mkdirSync(d, {recursive: true});
  return l;
};

export const PYTHON = process.env.PYTHON || 'python3';

export const ff = (args: string[], timeout = 300000) =>
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-nostdin', ...args], {stdio: ['ignore', 'ignore', 'pipe'], timeout});

/** Runs a step; on failure tries once more, then gives up (the caller decides the fallback). */
export async function step<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  log.step(name);
  for (let attempt = 1; ; attempt++) {
    try {
      const t0 = Date.now();
      const out = await fn();
      log.ok(`${name} done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return out;
    } catch (e) {
      const msg = (e as Error).message?.split('\n')[0] ?? String(e);
      if (attempt >= 2) {
        log.error(`${name} failed twice: ${msg}`);
        throw e;
      }
      log.warn(`${name} failed (${msg}), trying once more`);
    }
  }
}

/** Like step(), but returns the fallback instead of throwing. */
export async function stepOr<T>(name: string, fn: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await step(name, fn);
  } catch {
    log.warn(`${name}: using the fallback`);
    return fallback;
  }
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-') || 'video';

/** Small seeded random, so the same script gives the same edit. */
export function rng(seedText: string) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
