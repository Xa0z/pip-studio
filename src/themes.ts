/**
 * Video themes. Each user picks one for their account; every video they get uses it.
 * A theme is two choices (background and accent); the rest of the palette is derived so
 * text, panels and captions always stay readable.
 */

export type VideoTheme = {
  bg: string; // page background
  surface: string; // cards and panels
  track: string; // empty part of bars
  line: string; // borders and the frame line
  ink: string; // main text
  inkMuted: string; // secondary text
  accent: string; // highlights, badges, buttons, active caption word
  accent2: string; // second bar colour, arrows
  accentSoft: string; // third bar colour
  marker: string; // highlighter band behind key words
  onAccent: string; // text on accent
};

/** Optional brand colours a user can send on top of background + accent (from a labelled palette). */
export type BrandExtras = {ink?: string; inkMuted?: string; surface?: string; accent2?: string; accentSoft?: string; marker?: string};
const EXTRA_KEYS = ['ink', 'inkMuted', 'surface', 'accent2', 'accentSoft', 'marker'] as const;

/** What we store per user: a preset id, or custom background + accent colours (plus any brand extras). */
export type ThemeChoice = {preset: PresetId} | ({preset: 'custom'; bg: string; accent: string} & BrandExtras);

export const PRESETS = {
  sage: {label: 'Sage', bg: '#EBE5DF', accent: '#465B53'},
  ink: {label: 'Ink', bg: '#F4F2EE', accent: '#1F2124'},
  clay: {label: 'Clay', bg: '#F2E8DC', accent: '#A84F2C'},
  harbor: {label: 'Harbor', bg: '#E4EAEC', accent: '#2C5A78'},
  plum: {label: 'Plum', bg: '#EFE7EB', accent: '#6A3B58'},
  night: {label: 'Night', bg: '#1C1F21', accent: '#A7B8A9'},
} as const;
export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
export const DEFAULT_THEME: ThemeChoice = {preset: 'sage'};

// Sage is hand-tuned to match the website exactly.
const SAGE: VideoTheme = {
  bg: '#EBE5DF',
  surface: '#F7F6F2',
  track: '#DCD5CC',
  line: '#CFC8BE',
  ink: '#24272A',
  inkMuted: '#5B6B68',
  accent: '#465B53',
  accent2: '#73847C',
  accentSoft: '#A7B8A9',
  marker: '#C5D3C7',
  onAccent: '#F7F6F2',
};

// ---------- colour maths ----------
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** "#abc", "abc", "#AABBCC" -> "#AABBCC". Null if it is not a colour. */
export function normalizeHex(s: string): string | null {
  const m = HEX.exec(s.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Mix a toward b by t (0 = a, 1 = b). */
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_INK = '#F2F1EC';
const DARK_INK = '#24272A';

/** Build the full palette from a background and an accent. */
export function deriveTheme(bgIn: string, accentIn: string): VideoTheme {
  const bg = normalizeHex(bgIn) ?? SAGE.bg;
  const accent = normalizeHex(accentIn) ?? SAGE.accent;
  const dark = luminance(bg) < 0.18;
  const ink = dark ? LIGHT_INK : DARK_INK;
  return {
    bg,
    surface: dark ? mix(bg, '#FFFFFF', 0.07) : mix(bg, '#FFFFFF', 0.6),
    track: mix(bg, ink, 0.1),
    line: mix(bg, ink, 0.16),
    ink,
    inkMuted: mix(ink, bg, 0.38),
    accent,
    accent2: mix(accent, bg, 0.3),
    accentSoft: mix(accent, bg, 0.55),
    marker: mix(accent, bg, 0.72),
    onAccent: contrast(LIGHT_INK, accent) >= contrast(DARK_INK, accent) ? '#F7F6F2' : DARK_INK,
  };
}

/**
 * Use the user's own brand colours where they stay readable; anything that would be hard
 * to read falls back to the derived colour.
 */
export function applyExtras(base: VideoTheme, x: BrandExtras): VideoTheme {
  const t = {...base};
  const ok = (c: string | undefined): c is string => !!c && !!normalizeHex(c);
  if (ok(x.surface) && contrast(t.ink, x.surface) >= 7) t.surface = normalizeHex(x.surface)!;
  if (ok(x.ink) && contrast(x.ink, t.bg) >= 7 && contrast(x.ink, t.surface) >= 7) t.ink = normalizeHex(x.ink)!;
  if (ok(x.inkMuted) && contrast(x.inkMuted, t.bg) >= 3.5) t.inkMuted = normalizeHex(x.inkMuted)!;
  if (ok(x.accent2) && contrast(x.accent2, t.bg) >= 1.5) t.accent2 = normalizeHex(x.accent2)!;
  if (ok(x.accentSoft) && contrast(x.accentSoft, t.bg) >= 1.2) t.accentSoft = normalizeHex(x.accentSoft)!;
  // The marker is the highlighter band behind key words, which are drawn in the accent colour.
  if (ok(x.marker) && contrast(t.accent, x.marker) >= 2) t.marker = normalizeHex(x.marker)!;
  return t;
}

export function resolveTheme(choice: ThemeChoice | null | undefined): VideoTheme {
  if (!choice || choice.preset === 'sage') return SAGE;
  if (choice.preset === 'custom') return applyExtras(deriveTheme(choice.bg, choice.accent), choice);
  const p = PRESETS[choice.preset];
  return p ? deriveTheme(p.bg, p.accent) : SAGE;
}

export function themeLabel(choice: ThemeChoice | null | undefined): string {
  if (!choice) return PRESETS.sage.label;
  if (choice.preset === 'custom') return `Custom (${choice.bg} and ${choice.accent})`;
  return PRESETS[choice.preset]?.label ?? PRESETS.sage.label;
}

// Brand palette labels people use, mapped to the part of the video they colour.
const LABELS: Record<string, keyof BrandExtras | 'bg' | 'primary' | 'accentLabel'> = {
  background: 'bg', bg: 'bg', base: 'bg', canvas: 'bg',
  primary: 'primary', brand: 'primary', main: 'primary',
  secondary: 'accent2',
  accent: 'accentLabel', tertiary: 'accentLabel',
  surface: 'surface', card: 'surface', panel: 'surface',
  text: 'ink', ink: 'ink', foreground: 'ink', fg: 'ink',
  muted: 'inkMuted', subtle: 'inkMuted', 'muted text': 'inkMuted', 'secondary text': 'inkMuted',
  highlight: 'marker', marker: 'marker',
};

/** Read "Label: #hex" lines. Returns null when the text has no labelled colours. */
function parseLabelled(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of text.split(/\n|;/)) {
    const m = /^[\s\-*•]*([a-z][a-z ]*?)\s*(?:colou?r)?\s*[:=\-–—]?\s*#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(line);
    if (!m) continue;
    const key = LABELS[m[1].trim().toLowerCase()];
    const hex = normalizeHex(m[2]);
    if (key && hex && !out[key]) out[key] = hex;
  }
  return out.bg ? out : null;
}

/**
 * Parse colours typed by a user. Either "background accent", e.g. "#F2E8DC #A84F2C" or
 * "f2e8dc, a84f2c", or a labelled brand palette ("Background: #F7F8FC", "Primary: #6C8FF5", ...).
 * Returns an error message when the colours would be hard to read.
 */
export function parseCustomTheme(text: string): {ok: true; choice: ThemeChoice} | {ok: false; error: string} {
  const labelled = parseLabelled(text);
  if (labelled) {
    const bg = labelled.bg;
    // The accent fills badges, buttons and the active caption word, so it must stand out from the
    // background. Light "highlight" colours usually can't, so they become the marker band instead.
    const candidates = [labelled.primary, labelled.accentLabel, labelled.marker, labelled.accent2].filter(Boolean);
    const accent = candidates.find((c) => contrast(bg, c) >= 2.5);
    if (!accent) return {ok: false, error: candidates.length ? 'contrast' : 'two'};
    const choice: ThemeChoice = {preset: 'custom', bg, accent};
    if (labelled.accentLabel && labelled.accentLabel !== accent) choice.accentSoft = labelled.accentLabel;
    for (const k of EXTRA_KEYS) if (k !== 'accentSoft' && labelled[k] && labelled[k] !== accent) choice[k] = labelled[k];
    return {ok: true, choice};
  }
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length < 2) return {ok: false, error: 'two'};
  const [bg, accent] = parts.slice(0, 2).map(normalizeHex);
  if (!bg || !accent) return {ok: false, error: 'hex'};
  if (contrast(bg, accent) < 2.5) return {ok: false, error: 'contrast'};
  return {ok: true, choice: {preset: 'custom', bg, accent}};
}

export function isThemeChoice(x: unknown): x is ThemeChoice {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  if (c.preset === 'custom')
    return typeof c.bg === 'string' && typeof c.accent === 'string' && !!normalizeHex(c.bg) && !!normalizeHex(c.accent) && EXTRA_KEYS.every((k) => c[k] === undefined || (typeof c[k] === 'string' && !!normalizeHex(c[k] as string)));
  return typeof c.preset === 'string' && c.preset in PRESETS;
}
