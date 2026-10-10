/**
 * Free media library: when a script asks for a real photo or clip, find one in an open library,
 * check its licence, download it and shrink it for the render.
 *
 * Sources (all free):
 * - Openverse (openverse.org): photos, no key. Only CC0 and public domain, so no credit is needed.
 * - Pexels (pexels.com/api): photos and clips, free key PEXELS_API_KEY. Pexels licence: free to use, no credit needed.
 * - Pixabay (pixabay.com/api/docs): photos and clips, free key PIXABAY_API_KEY. Content licence: free to use, no credit needed.
 * Clips need a Pexels or Pixabay key; without one, a clip request falls back to a photo.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {Visual} from '../../src/schema.js';
import {famousCharacter} from '../lib/copyright.js';
import {redact} from '../lib/redact.js';

export type MediaVisual = Extract<Visual, {layout: 'media'}>;
export type MediaHit = {
  source: 'openverse' | 'pexels' | 'pixabay';
  id: string;
  kind: 'photo' | 'clip';
  url: string; // file to download
  page: string; // where a person can see it and its licence
  author: string;
  license: string;
  width: number;
  height: number;
  seconds?: number;
};
export type MediaKeys = {pexels?: string; pixabay?: string};
type Fetch = typeof fetch;

const UA = {'User-Agent': 'PipStudio/1.0 (+https://shadhealth.com)'};
const MIN_W = 700;
const MAX_DOWNLOAD = 60 * 1024 * 1024;

/** Brands and famous names never go into a search: the result could be someone's logo or character. */
const BRANDS = /\b(nike|adidas|apple|iphone|samsung|google|coca[- ]?cola|pepsi|mcdonald'?s|starbucks|disney|marvel|netflix|tesla|lego|barbie|nintendo|playstation|xbox|amazon|facebook|instagram|tiktok|youtube)\b/i;
export function safeQuery(q: string): string | null {
  const t = q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || BRANDS.test(t) || famousCharacter(t)) return null;
  return t.split(' ').slice(0, 6).join(' ');
}

/** Tall pictures fit a vertical video best; wide ones still work (they get cropped). */
const score = (h: MediaHit) => (h.height >= h.width ? 2 : h.height * 1.6 >= h.width ? 1 : 0) + Math.min(1, h.width / 1600);

async function getJson(fetcher: Fetch, url: string, headers: Record<string, string> = {}) {
  const res = await fetcher(url, {headers: {...UA, ...headers}, signal: AbortSignal.timeout(15000)});
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return res.json() as Promise<any>;
}

export async function searchOpenverse(q: string, fetcher: Fetch = fetch): Promise<MediaHit[]> {
  const j = await getJson(fetcher, `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&mature=false&page_size=20`);
  return (j.results ?? [])
    .filter((r: any) => ['cc0', 'pdm'].includes(String(r.license).toLowerCase()) && r.url && (r.width ?? 0) >= MIN_W)
    .map((r: any): MediaHit => ({source: 'openverse', id: String(r.id), kind: 'photo', url: r.url, page: r.foreign_landing_url ?? r.url, author: r.creator ?? 'unknown', license: String(r.license).toUpperCase(), width: r.width, height: r.height}));
}

export async function searchPexels(q: string, kind: 'photo' | 'clip', key: string, fetcher: Fetch = fetch): Promise<MediaHit[]> {
  const auth = {Authorization: key};
  if (kind === 'photo') {
    const j = await getJson(fetcher, `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=20`, auth);
    return (j.photos ?? []).map((p: any): MediaHit => ({source: 'pexels', id: String(p.id), kind, url: p.src?.large2x ?? p.src?.original, page: p.url, author: p.photographer ?? 'unknown', license: 'Pexels License', width: p.width, height: p.height}));
  }
  const j = await getJson(fetcher, `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=15`, auth);
  return (j.videos ?? []).flatMap((v: any): MediaHit[] => {
    const files = (v.video_files ?? []).filter((f: any) => f.file_type === 'video/mp4' && f.width >= 540 && f.width <= 1440).sort((a: any, b: any) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    const f = files[0];
    return f ? [{source: 'pexels', id: String(v.id), kind, url: f.link, page: v.url, author: v.user?.name ?? 'unknown', license: 'Pexels License', width: f.width, height: f.height, seconds: v.duration}] : [];
  });
}

export async function searchPixabay(q: string, kind: 'photo' | 'clip', key: string, fetcher: Fetch = fetch): Promise<MediaHit[]> {
  if (kind === 'photo') {
    const j = await getJson(fetcher, `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&orientation=vertical&safesearch=true&per_page=20`);
    return (j.hits ?? []).map((h: any): MediaHit => ({source: 'pixabay', id: String(h.id), kind, url: h.largeImageURL, page: h.pageURL, author: h.user ?? 'unknown', license: 'Pixabay Content License', width: h.imageWidth, height: h.imageHeight}));
  }
  const j = await getJson(fetcher, `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&safesearch=true&per_page=15`);
  return (j.hits ?? []).flatMap((h: any): MediaHit[] => {
    const f = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
    return f?.url ? [{source: 'pixabay', id: String(h.id), kind, url: f.url, page: h.pageURL, author: h.user ?? 'unknown', license: 'Pixabay Content License', width: f.width, height: f.height, seconds: h.duration}] : [];
  });
}

/** Best hit for a request, trying sources in order. Clips fall back to photos when nothing is found. */
export async function findMedia(v: Pick<MediaVisual, 'kind' | 'query'>, keys: MediaKeys, opts: {fetcher?: Fetch; used?: Set<string>; minSeconds?: number} = {}): Promise<MediaHit | null> {
  const q = safeQuery(v.query);
  if (!q) return null;
  const fetcher = opts.fetcher ?? fetch;
  const used = opts.used ?? new Set<string>();
  const tries: (() => Promise<MediaHit[]>)[] = [];
  if (v.kind === 'clip') {
    if (keys.pexels) tries.push(() => searchPexels(q, 'clip', keys.pexels!, fetcher));
    if (keys.pixabay) tries.push(() => searchPixabay(q, 'clip', keys.pixabay!, fetcher));
  }
  if (keys.pexels) tries.push(() => searchPexels(q, 'photo', keys.pexels!, fetcher));
  if (keys.pixabay) tries.push(() => searchPixabay(q, 'photo', keys.pixabay!, fetcher));
  tries.push(() => searchOpenverse(q, fetcher));
  for (const t of tries) {
    let hits: MediaHit[];
    try {
      hits = await t();
    } catch (e) {
      console.warn('Media search failed:', redact((e as Error).message));
      continue;
    }
    const ok = hits.filter((h) => h.url && /^https:\/\//.test(h.url) && !used.has(`${h.source}:${h.id}`) && (h.kind === 'photo' || (h.seconds ?? 0) >= (opts.minSeconds ?? 4)));
    if (!ok.length) continue;
    // Keep the search's own relevance order, nudged toward tall, large files.
    const best = ok.slice(0, 8).sort((a, b) => score(b) - score(a))[0];
    used.add(`${best.source}:${best.id}`);
    return best;
  }
  return null;
}

/** Downloads a hit and makes a render-friendly copy: JPEG at most 1200 px wide, or a silent 720p H.264 clip. */
export async function downloadMedia(hit: MediaHit, outBase: string, fetcher: Fetch = fetch): Promise<string> {
  const res = await fetcher(hit.url, {headers: UA, signal: AbortSignal.timeout(60000)});
  if (!res.ok) throw new Error(`download answered ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_DOWNLOAD) throw new Error('file too big');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD) throw new Error('file too big');
  const raw = `${outBase}.src`;
  fs.writeFileSync(raw, buf);
  const out = `${outBase}.${hit.kind === 'clip' ? 'mp4' : 'jpg'}`;
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-nostdin', ...args], {stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000});
  if (hit.kind === 'clip') ff(['-i', raw, '-t', '15', '-an', '-vf', "scale='min(720,iw)':-2,fps=30", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  else ff(['-i', raw, '-frames:v', '1', '-vf', "scale='min(1200,iw)':-2", '-q:v', '3', out]);
  fs.rmSync(raw, {force: true});
  return out;
}

export type ResolvedMedia = {file: string; publicName: string; hit: MediaHit};
export type MediaFinder = (v: MediaVisual, ctx: {dir: string; index: number; used: Set<string>; sceneSeconds: number}) => Promise<ResolvedMedia | null>;

export const keysFromEnv = (): MediaKeys => ({pexels: process.env.PEXELS_API_KEY || undefined, pixabay: process.env.PIXABAY_API_KEY || undefined});

/** The real finder used on GitHub Actions. */
export const realMediaFinder: MediaFinder = async (v, {dir, index, used, sceneSeconds}) => {
  const hit = await findMedia(v, keysFromEnv(), {used, minSeconds: Math.min(8, Math.max(3, sceneSeconds - 1))});
  if (!hit) return null;
  fs.mkdirSync(dir, {recursive: true});
  const file = await downloadMedia(hit, path.join(dir, `scene${index + 1}`));
  return {file, publicName: `media/${path.basename(file)}`, hit};
};

/** Who made it and under what licence (kept on the video row; none of these licences require showing it). */
export const creditFor = (h: MediaHit) => `${h.kind === 'clip' ? 'Clip' : 'Photo'} by ${h.author} on ${h.source === 'openverse' ? 'Openverse' : h.source === 'pexels' ? 'Pexels' : 'Pixabay'} (${h.license}): ${h.page}`;
