/**
 * Video styles. The user's theme fixes the colours; the style changes everything else
 * (backdrop, how text and cuts move, the opening, captions, 2D or 3D visuals), so two
 * videos in a row never look the same. Picked by code per video, never by Claude.
 */

export const STYLE_OPTIONS = {
  /** What sits behind everything. */
  backdrop: ['glow', 'shapes', 'grid', 'bands', 'dots'],
  /** How headlines come in. */
  headline: ['kinetic', 'rise', 'typed', 'stamp'],
  /** Headline alignment. */
  align: ['left', 'center'],
  /** The family of cuts between scenes. */
  cuts: ['classic', 'slide', 'flip', 'iris'],
  /** The first scene. */
  hook: ['search', 'card', 'poster'],
  /** Visuals in flat 2D, some in 3D, or as many in 3D as possible. */
  depth: ['flat', 'mixed', 'deep'],
  /** Which corner the character sits in during fact scenes. */
  side: ['right', 'left'],
  /** Progress indicator along the top. */
  progress: ['segments', 'line', 'none'],
  /** Spoken-word captions. */
  captions: ['pill', 'underline', 'card'],
} as const;

type Options = typeof STYLE_OPTIONS;
export type VideoStyle = {[K in keyof Options]: Options[K][number]};
export type StyleKey = keyof VideoStyle;
const KEYS = Object.keys(STYLE_OPTIONS) as StyleKey[];

/** The original look, used when a render has no style (old videos, Pip Explains). */
export const CLASSIC_STYLE: VideoStyle = {
  backdrop: 'glow',
  headline: 'kinetic',
  align: 'left',
  cuts: 'classic',
  hook: 'search',
  depth: 'flat',
  side: 'right',
  progress: 'segments',
  captions: 'pill',
};

/** Small deterministic random numbers (mulberry32), so the same seed gives the same style. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from any string (e.g. a video id). */
export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** How many of the style choices differ. */
export const styleDistance = (a: VideoStyle, b: VideoStyle) => KEYS.filter((k) => a[k] !== b[k]).length;

/**
 * Picks a style for a new video. Every choice is random, except the ones the most recent
 * video used (so the opening, cuts, backdrop and headline motion always change from one
 * video to the next), and it must differ in most ways from the last few videos too.
 */
export function pickStyle(seed: number, recent: VideoStyle[] = []): VideoStyle {
  const rand = rng(seed);
  const last = recent[0];
  // These are the most visible, so they never repeat back to back.
  const fresh: StyleKey[] = ['backdrop', 'headline', 'cuts', 'hook'];
  let best: VideoStyle | null = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const s = {} as Record<StyleKey, string>;
    for (const k of KEYS) {
      let pool: readonly string[] = STYLE_OPTIONS[k];
      if (last && fresh.includes(k)) pool = pool.filter((v) => v !== last[k]);
      // 3D on most videos, but not every one.
      if (k === 'depth') pool = rand() < 0.8 ? pool.filter((v) => v !== 'flat') : pool;
      s[k] = pool[Math.floor(rand() * pool.length)];
    }
    const style = s as VideoStyle;
    const score = recent.length ? Math.min(...recent.slice(0, 3).map((r) => styleDistance(style, r))) : KEYS.length;
    if (score > bestScore) {
      best = style;
      bestScore = score;
    }
    if (score >= 6) break;
  }
  return best!;
}

export function isVideoStyle(x: unknown): x is VideoStyle {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return KEYS.every((k) => (STYLE_OPTIONS[k] as readonly unknown[]).includes(o[k]));
}

/** Fills in anything missing or unknown from the classic style. */
export const resolveStyle = (x: Partial<VideoStyle> | null | undefined): VideoStyle => {
  const out = {...CLASSIC_STYLE};
  if (!x || typeof x !== 'object') return out;
  for (const k of KEYS) if ((STYLE_OPTIONS[k] as readonly unknown[]).includes(x[k])) (out as Record<string, unknown>)[k] = x[k];
  return out;
};

/** A short name for logs and the video list, e.g. "grid · flip · poster · 3D". */
export const styleLabel = (s: VideoStyle) => [s.backdrop, s.cuts, s.hook, s.depth === 'flat' ? '2D' : '3D'].join(' · ');
