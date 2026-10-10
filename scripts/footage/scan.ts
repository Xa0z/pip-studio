/**
 * Reads library/clips and library/photos, asks ffprobe for each file's duration, size and fps,
 * and writes library/media.json. The index and the edit read that file, so footage can be
 * added or swapped without touching code.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {readCredits} from './credits.js';
import type {Library} from './paths.js';

export type MediaItem = {
  file: string; // relative to the library root, e.g. clips/wikimedia-123.mp4
  kind: 'clip' | 'photo';
  duration: number; // seconds (0 for photos)
  width: number;
  height: number;
  fps: number;
  orientation: 'vertical' | 'horizontal' | 'square';
  size: number;
  mtime: number;
  tags: string; // words from the source title and search, used when OpenCLIP is not available
};

const CLIP_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

export function probe(file: string): {duration: number; width: number; height: number; fps: number} {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file], {encoding: 'utf8', timeout: 30000});
  const j = JSON.parse(out);
  const s = j.streams?.[0] ?? {};
  const [n, d] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  return {duration: Number(j.format?.duration ?? 0) || 0, width: s.width ?? 0, height: s.height ?? 0, fps: d ? Math.round((n / d) * 100) / 100 : 0};
}

export const orientationOf = (w: number, h: number): MediaItem['orientation'] => (h > w * 1.05 ? 'vertical' : w > h * 1.05 ? 'horizontal' : 'square');

export function scanLibrary(l: Library): MediaItem[] {
  const credits = readCredits(l);
  const old = new Map<string, MediaItem>();
  if (fs.existsSync(l.media)) {
    try {
      for (const it of JSON.parse(fs.readFileSync(l.media, 'utf8')).items as MediaItem[]) old.set(it.file, it);
    } catch {
      /* rebuilt below */
    }
  }
  const items: MediaItem[] = [];
  for (const [dir, kind, ext] of [[l.clips, 'clip', CLIP_EXT], [l.photos, 'photo', PHOTO_EXT]] as const) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!ext.test(name)) continue;
      const abs = path.join(dir, name);
      const rel = path.relative(l.root, abs).split(path.sep).join('/');
      const st = fs.statSync(abs);
      const prev = old.get(rel);
      const c = credits[rel];
      const tags = [c?.title, c?.query, name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')].filter(Boolean).join(' ').toLowerCase();
      if (prev && prev.size === st.size && prev.mtime === Math.round(st.mtimeMs)) {
        items.push({...prev, tags});
        continue;
      }
      try {
        const p = probe(abs);
        if (!p.width || !p.height || (kind === 'clip' && p.duration < 1)) continue;
        items.push({file: rel, kind, duration: kind === 'clip' ? p.duration : 0, width: p.width, height: p.height, fps: p.fps, orientation: orientationOf(p.width, p.height), size: st.size, mtime: Math.round(st.mtimeMs), tags});
      } catch {
        // Not a readable media file; leave it out.
      }
    }
  }
  fs.writeFileSync(l.media, JSON.stringify({items}, null, 1));
  return items;
}
