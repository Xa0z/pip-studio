/**
 * Business knowledge: what a user tells the bot about their business (notes they type,
 * files they send, their website). Video scripts read it so marketing videos (and, if the
 * user wants, explainer videos) talk about the real business instead of guessing.
 */
import {unzipSync, strFromU8} from 'fflate';
import type {KnowledgeItem, OnboardingData} from './types.js';

export const MAX_ITEMS = 20;
/** One item never keeps more than this many characters. */
export const MAX_ITEM_CHARS = 6000;
/** All items together (stored in the user's row, so kept small). */
export const MAX_TOTAL_CHARS = 30000;
/** Files bigger than this are refused before download. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** How much knowledge one script prompt gets. */
export const PROMPT_CHARS = 9000;

export type FileKind = 'text' | 'pdf' | 'docx' | 'html';

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|rtf|text)$/i;

/** What we can read from a file, by its type or name. Null when we can't read it. */
export function fileKind(mime: string | undefined, name: string | undefined): FileKind | null {
  const m = (mime ?? '').toLowerCase();
  const n = name ?? '';
  if (m === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
  if (m.includes('wordprocessingml') || /\.docx$/i.test(n)) return 'docx';
  if (m === 'text/html' || /\.html?$/i.test(n)) return 'html';
  if (m.startsWith('text/') || m === 'application/json' || TEXT_EXT.test(n)) return 'text';
  return null;
}

/** Tidies text: one space between words, at most one blank line between paragraphs. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', pound: '£', copy: '©'};
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });

/** Page text without scripts, styles, menus or tags. Keeps the title and description first. */
export function htmlToText(html: string): {title: string; text: string} {
  const title = tidy(decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')).slice(0, 80);
  const desc = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ?? '';
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br|header|main)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  const text = tidy([decode(desc), decode(body)].filter(Boolean).join('\n\n'));
  return {title, text};
}

/** The words in a .docx file (paragraphs kept). */
export function docxToText(buf: Uint8Array): string {
  const files = unzipSync(buf, {filter: (f) => f.name === 'word/document.xml'});
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('not a Word file');
  const s = strFromU8(xml)
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return tidy(decode(s));
}

export async function pdfToText(buf: Uint8Array): Promise<string> {
  const {extractText, getDocumentProxy} = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const {text} = await extractText(pdf, {mergePages: true});
  return tidy(String(text));
}

/** Reads a file into plain text. Throws with a short reason when it can't. */
export async function fileToText(buf: Uint8Array, kind: FileKind): Promise<string> {
  if (kind === 'pdf') return pdfToText(buf);
  if (kind === 'docx') return docxToText(buf);
  const raw = new TextDecoder('utf-8', {fatal: false}).decode(buf);
  return kind === 'html' ? htmlToText(raw).text : tidy(raw);
}

/** Only public http(s) pages: no local or private network addresses. */
export function safeUrl(input: string): URL | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return null; // raw IPs: only names
  return u;
}

/** A message that is just a link (so we read the page instead of saving the link as a note). */
export const onlyLink = (text: string) => {
  const t = text.trim();
  return /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?)$/i.test(t) ? t : null;
};

/** Downloads a public page and returns its text. */
export async function fetchPage(url: URL, fetcher: typeof fetch = fetch): Promise<{title: string; text: string}> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetcher(current, {redirect: 'manual', signal: AbortSignal.timeout(9000), headers: {'User-Agent': 'PipStudioBot/1.0 (+https://shadhealth.com)', Accept: 'text/html,text/plain'}});
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = safeUrl(new URL(res.headers.get('location')!, current).toString());
      if (!next) throw new Error('the page redirects somewhere I can not open');
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(`the site answered ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/(html|plain)|application\/xhtml/i.test(type)) throw new Error('that link is not a web page');
    const body = await readCapped(res, 2 * 1024 * 1024);
    return /text\/plain/i.test(type) ? {title: current.hostname, text: tidy(body)} : htmlToText(body);
  }
  throw new Error('too many redirects');
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const all = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, all.length - at));
    all.set(part, at);
    at += part.length;
  }
  return new TextDecoder('utf-8', {fatal: false}).decode(all);
}

/** Cuts by characters, never inside an emoji. */
const cutChars = (s: string, n: number) => {
  const chars = [...s];
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : s;
};

export const totalChars = (items: KnowledgeItem[] | undefined) => (items ?? []).reduce((n, i) => n + i.text.length, 0);

export type AddResult = {ok: true; items: KnowledgeItem[]; item: KnowledgeItem; trimmed: boolean} | {ok: false; why: 'empty' | 'full'};

/** Adds an item, trimming it to fit. Same title replaces the old copy (e.g. a re-sent file). */
export function addKnowledge(items: KnowledgeItem[] | undefined, input: Omit<KnowledgeItem, 'text'> & {text: string}): AddResult {
  const text = tidy(input.text);
  if (text.length < 3) return {ok: false, why: 'empty'};
  const others = (items ?? []).filter((i) => !(i.kind !== 'note' && i.kind === input.kind && i.title === input.title));
  if (others.length >= MAX_ITEMS) return {ok: false, why: 'full'};
  const room = MAX_TOTAL_CHARS - totalChars(others);
  if (room < 200) return {ok: false, why: 'full'};
  const limit = Math.min(MAX_ITEM_CHARS, room);
  const kept = [...text].length > limit ? cutChars(text, limit) : text;
  const item: KnowledgeItem = {...input, title: cutChars(tidy(input.title).replace(/\n/g, ' '), 60) || 'Note', text: kept};
  return {ok: true, items: [...others, item], item, trimmed: kept !== text};
}

export const removeKnowledge = (items: KnowledgeItem[] | undefined, id: string) => (items ?? []).filter((i) => i.id !== id);

/** A short title for a typed note: its first words. */
export const noteTitle = (text: string) => {
  const first = tidy(text).split('\n')[0];
  return cutChars(first, 40);
};

/**
 * Everything the user told us about their business, for a script prompt: the short summary
 * first, then each item, sharing `max` characters so one long file can't crowd out the rest.
 */
export function knowledgeText(d: Pick<OnboardingData, 'business' | 'knowledge'>, max = PROMPT_CHARS): string {
  const parts: {head: string; text: string}[] = [];
  if (d.business?.trim()) parts.push({head: 'Summary', text: d.business.trim()});
  for (const i of d.knowledge ?? []) parts.push({head: `${i.kind === 'link' ? 'Website' : i.kind === 'file' ? 'File' : 'Note'}: ${i.title}`, text: i.text});
  if (!parts.length) return '';
  // Fair share: short items keep all their text, long ones split what is left.
  const budget = max - parts.reduce((n, p) => n + p.head.length + 6, 0);
  const sorted = [...parts].sort((a, b) => a.text.length - b.text.length);
  const allow = new Map<(typeof parts)[number], number>();
  let left = Math.max(0, budget);
  sorted.forEach((p, k) => {
    const share = Math.floor(left / (sorted.length - k));
    const take = Math.min(p.text.length, share);
    allow.set(p, take);
    left -= take;
  });
  return parts.map((p) => `## ${p.head}\n${cutChars(p.text, allow.get(p) ?? 0)}`).join('\n\n');
}

export const hasKnowledge = (d: Pick<OnboardingData, 'business' | 'knowledge'>) => !!d.business?.trim() || !!(d.knowledge ?? []).length;
