/**
 * Free footage sources, tried in this order when the library has nothing good:
 *   b) Wikimedia Commons and Internet Archive (no key). Only CC0, public domain and CC BY.
 *   c) Pexels and Pixabay official APIs, only if PEXELS_KEY / PIXABAY_KEY (free keys) are set.
 * No website is scraped: these are the sites' own public APIs.
 * Every download lands in the library with its licence and source page in library/credits.json.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {log} from '../../src/log.js';
import {addCredit, allowedLicense, Credit, readCredits} from './credits.js';
import {ff, Library} from './paths.js';

export type Kind = 'clip' | 'photo';
export type Hit = Omit<Credit, 'downloadedAt' | 'query'> & {kind: Kind; width: number; height: number; seconds?: number};
type Fetch = typeof fetch;

const UA = 'PipStudio-RealEdit/1.0 (https://shadhealth.com; free educational videos)';
const MAX_CLIP_SECONDS = 30;

const strip = (html: unknown) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function getJson(fetcher: Fetch, url: string, headers: Record<string, string> = {}) {
  const res = await fetcher(url, {headers: {'User-Agent': UA, ...headers}, signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return res.json() as Promise<any>;
}

export const keys = () => ({
  pexels: process.env.PEXELS_KEY || process.env.PEXELS_API_KEY || '',
  pixabay: process.env.PIXABAY_KEY || process.env.PIXABAY_API_KEY || '',
});

// ---------- Wikimedia Commons ----------
export async function searchWikimedia(q: string, kind: Kind, fetcher: Fetch = fetch): Promise<Hit[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `${q} filetype:${kind === 'clip' ? 'video' : 'bitmap'}`,
    gsrlimit: '20',
    prop: kind === 'clip' ? 'videoinfo' : 'imageinfo',
    [kind === 'clip' ? 'viprop' : 'iiprop']: kind === 'clip' ? 'url|size|mime|extmetadata|derivatives' : 'url|size|mime|extmetadata',
    ...(kind === 'photo' ? {iiurlwidth: '1600'} : {}),
    origin: '*',
  });
  const j = await getJson(fetcher, `https://commons.wikimedia.org/w/api.php?${params}`);
  const pages = Object.values(j.query?.pages ?? {}) as any[];
  pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const hits: Hit[] = [];
  for (const p of pages) {
    const info = (p.videoinfo ?? p.imageinfo)?.[0];
    if (!info) continue;
    const m = info.extmetadata ?? {};
    const license = strip(m.LicenseShortName?.value) || strip(m.License?.value);
    const licenseUrl = strip(m.LicenseUrl?.value);
    if (!allowedLicense(license, licenseUrl)) continue;
    let url = info.thumburl ?? info.url;
    let width = info.thumbwidth ?? info.width;
    let height = info.thumbheight ?? info.height;
    if (kind === 'clip') {
      // Pick a transcoded copy near 720-1080p instead of the (often huge) original.
      const ders = ((info.derivatives ?? []) as any[]).filter((d) => d.src && d.height && /webm|mp4/.test(d.type ?? ''));
      ders.sort((a, b) => Math.abs(Math.min(a.width, a.height) - 1080) - Math.abs(Math.min(b.width, b.height) - 1080));
      const d = ders[0];
      if (d) ({src: url, width, height} = d);
      if (Number(info.duration ?? 99) < 3) continue;
    }
    if (!url || Math.min(width ?? 0, height ?? 0) < 480) continue;
    hits.push({
      source: 'wikimedia',
      id: String(p.pageid),
      kind,
      title: strip(m.ObjectName?.value) || String(p.title ?? '').replace(/^File:/, ''),
      author: strip(m.Artist?.value) || 'unknown',
      license,
      licenseUrl,
      page: info.descriptionurl ?? `https://commons.wikimedia.org/?curid=${p.pageid}`,
      url,
      width,
      height,
      seconds: info.duration ? Number(info.duration) : undefined,
    });
  }
  return hits;
}

// ---------- Internet Archive ----------
const IA_LICENSES = '(licenseurl:*publicdomain* OR licenseurl:*licenses\\/by\\/*)';

export async function searchArchive(q: string, kind: Kind, fetcher: Fetch = fetch, mediatype = kind === 'clip' ? 'movies' : 'image'): Promise<Hit[]> {
  const query = `(${q}) AND mediatype:(${mediatype}) AND ${IA_LICENSES}`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=8&output=json`;
  const j = await getJson(fetcher, url);
  const hits: Hit[] = [];
  for (const d of (j.response?.docs ?? []) as any[]) {
    const licenseUrl = String(d.licenseurl ?? '');
    const license = /publicdomain\/zero/.test(licenseUrl) ? 'CC0 1.0' : /publicdomain/.test(licenseUrl) ? 'Public domain' : /licenses\/by\//.test(licenseUrl) ? 'CC BY' : '';
    if (!allowedLicense(license, licenseUrl)) continue;
    let meta: any;
    try {
      meta = await getJson(fetcher, `https://archive.org/metadata/${encodeURIComponent(d.identifier)}`);
    } catch {
      continue;
    }
    const files = (meta.files ?? []) as any[];
    const want =
      mediatype === 'audio'
        ? files.filter((f) => /\.mp3$/i.test(f.name) && Number(f.length ?? 0) >= 45 && Number(f.length ?? 0) <= 480)
        : kind === 'clip'
          ? files.filter((f) => /\.mp4$/i.test(f.name) && Number(f.size ?? 0) < 400e6)
          : files.filter((f) => /\.jpe?g$/i.test(f.name) && !/thumb/i.test(f.name) && Number(f.size ?? 0) > 80e3);
    want.sort((a, b) => Number(a.size ?? 0) - Number(b.size ?? 0));
    const f = mediatype === 'audio' || kind === 'photo' ? want[want.length - 1] : (want.find((x) => /h\.264|mpeg4/i.test(x.format ?? '')) ?? want[0]);
    if (!f) continue;
    hits.push({
      source: 'archive',
      id: `${d.identifier}/${f.name}`,
      kind,
      title: strip(Array.isArray(d.title) ? d.title[0] : d.title),
      author: strip(Array.isArray(d.creator) ? d.creator[0] : d.creator) || 'unknown',
      license,
      licenseUrl,
      page: `https://archive.org/details/${d.identifier}`,
      url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(f.name)}`,
      width: Number(f.width ?? 1280),
      height: Number(f.height ?? 720),
      seconds: f.length ? Number(f.length) : undefined,
    });
  }
  return hits;
}

// ---------- Pexels / Pixabay (official APIs, free keys) ----------
export async function searchPexels(q: string, kind: Kind, key: string, fetcher: Fetch = fetch): Promise<Hit[]> {
  const auth = {Authorization: key};
  const base = {source: 'pexels' as const, license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/'};
  if (kind === 'photo') {
    const j = await getJson(fetcher, `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=15`, auth);
    return (j.photos ?? []).map((p: any): Hit => ({...base, id: String(p.id), kind, title: p.alt ?? q, url: p.src?.large2x ?? p.src?.original, page: p.url, author: p.photographer ?? 'unknown', width: p.width, height: p.height}));
  }
  const j = await getJson(fetcher, `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=12`, auth);
  return (j.videos ?? []).flatMap((v: any): Hit[] => {
    const files = (v.video_files ?? []).filter((f: any) => f.file_type === 'video/mp4' && f.width >= 540).sort((a: any, b: any) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    const f = files[0];
    return f ? [{...base, id: String(v.id), kind, title: q, url: f.link, page: v.url, author: v.user?.name ?? 'unknown', width: f.width, height: f.height, seconds: v.duration}] : [];
  });
}

export async function searchPixabay(q: string, kind: Kind, key: string, fetcher: Fetch = fetch): Promise<Hit[]> {
  const base = {source: 'pixabay' as const, license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/'};
  if (kind === 'photo') {
    const j = await getJson(fetcher, `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&orientation=vertical&safesearch=true&per_page=15`);
    return (j.hits ?? []).map((h: any): Hit => ({...base, id: String(h.id), kind, title: h.tags ?? q, url: h.largeImageURL, page: h.pageURL, author: h.user ?? 'unknown', width: h.imageWidth, height: h.imageHeight}));
  }
  const j = await getJson(fetcher, `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&safesearch=true&per_page=12`);
  return (j.hits ?? []).flatMap((h: any): Hit[] => {
    const f = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
    return f?.url ? [{...base, id: String(h.id), kind, title: h.tags ?? q, url: f.url, page: h.pageURL, author: h.user ?? 'unknown', width: f.width, height: f.height, seconds: h.duration}] : [];
  });
}

// ---------- Download into the library ----------
const safeName = (h: Hit) => `${h.source}-${h.id}`.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 80).replace(/-+$/, '');

function probeUrl(url: string): number {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-user_agent', UA, '-show_entries', 'format=duration', '-of', 'csv=p=0', url], {encoding: 'utf8', timeout: 60000});
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Downloads a hit and makes a render-friendly copy: clips become silent H.264 at 30 fps, short side at most 1080,
 * at most 30 s (long films start a little in, past the titles); photos become JPEG, long side at most 2400.
 */
export async function download(l: Library, hit: Hit, query: string): Promise<string> {
  const name = safeName(hit);
  if (hit.kind === 'clip') {
    const rel = `clips/${name}.mp4`;
    const out = path.join(l.root, rel);
    if (!fs.existsSync(out)) {
      const dur = hit.seconds ?? probeUrl(hit.url);
      const start = dur > 120 ? dur * 0.12 : 0;
      const tmp = `${out}.part.mp4`;
      ff(['-user_agent', UA, '-ss', start.toFixed(2), '-t', String(MAX_CLIP_SECONDS), '-i', hit.url, '-an', '-vf', "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)',fps=30,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-movflags', '+faststart', tmp], 600000);
      fs.renameSync(tmp, out);
    }
    addCredit(l, rel, {...strip4(hit), query, downloadedAt: new Date().toISOString()});
    return rel;
  }
  if (hit.kind === 'photo') {
    const rel = `photos/${name}.jpg`;
    const out = path.join(l.root, rel);
    if (!fs.existsSync(out)) {
      const res = await fetch(hit.url, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(60000)});
      if (!res.ok) throw new Error(`download answered ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 40e6) throw new Error('file too big');
      const raw = `${out}.src`;
      fs.writeFileSync(raw, buf);
      try {
        ff(['-i', raw, '-frames:v', '1', '-vf', "scale='if(gt(iw,ih),min(2400,iw),-2)':'if(gt(iw,ih),-2,min(2400,ih))'", '-q:v', '2', out]);
      } finally {
        fs.rmSync(raw, {force: true});
      }
    }
    addCredit(l, rel, {...strip4(hit), query, downloadedAt: new Date().toISOString()});
    return rel;
  }
  throw new Error('unknown kind');
}

const strip4 = ({kind: _k, width: _w, height: _h, seconds: _s, ...c}: Hit) => c;

export type Tier = 'free' | 'keyed';

/** Searches one tier of sources for a query and downloads up to `want` new files. Never throws. */
export async function fetchFootage(l: Library, query: string, tier: Tier, want = 2, kinds: Kind[] = ['clip', 'photo']): Promise<string[]> {
  const k = keys();
  const known = new Set(Object.values(readCredits(l)).map((c) => `${c.source}:${c.id}`));
  const searches: [string, () => Promise<Hit[]>][] = [];
  for (const kind of kinds) {
    if (tier === 'free') {
      searches.push([`Wikimedia ${kind}s`, () => searchWikimedia(query, kind)]);
      searches.push([`Internet Archive ${kind}s`, () => searchArchive(query, kind)]);
    } else {
      if (k.pexels) searches.push([`Pexels ${kind}s`, () => searchPexels(query, kind, k.pexels)]);
      if (k.pixabay) searches.push([`Pixabay ${kind}s`, () => searchPixabay(query, kind, k.pixabay)]);
    }
  }
  const got: string[] = [];
  for (const [name, search] of searches) {
    if (got.length >= want) break;
    let hits: Hit[] = [];
    try {
      hits = (await search()).filter((h) => !known.has(`${h.source}:${h.id}`));
    } catch (e) {
      log.warn(`${name} search for "${query}" failed: ${(e as Error).message}`);
      continue;
    }
    // Tall footage first, then the source's own relevance order.
    hits.sort((a, b) => Number(b.height > b.width) - Number(a.height > a.width));
    for (const h of hits.slice(0, 4)) {
      if (got.length >= want) break;
      try {
        got.push(await download(l, h, query));
        known.add(`${h.source}:${h.id}`);
        log.info(`Downloaded ${h.kind} from ${h.source} (${h.license}): ${h.title.slice(0, 60)}`);
      } catch (e) {
        log.warn(`Download from ${h.source} failed: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }
  return got;
}

/** A royalty-free music track from Internet Archive (CC0, public domain or CC BY) into library/music. */
export async function fetchMusic(l: Library, query = 'instrumental ambient'): Promise<string | null> {
  try {
    const hits = await searchArchive(query, 'clip', fetch, 'audio');
    for (const h of hits.slice(0, 4)) {
      const rel = `music/${safeName(h)}.mp3`;
      const out = path.join(l.root, rel);
      try {
        if (!fs.existsSync(out)) ff(['-user_agent', UA, '-i', h.url, '-vn', '-ac', '2', '-ar', '44100', '-b:a', '192k', '-t', '300', out], 300000);
        addCredit(l, rel, {...strip4(h), query, downloadedAt: new Date().toISOString()});
        log.info(`Music from Internet Archive (${h.license}): ${h.title.slice(0, 60)}`);
        return rel;
      } catch (e) {
        log.warn(`Music download failed: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  } catch (e) {
    log.warn(`Music search failed: ${(e as Error).message}`);
  }
  return null;
}
