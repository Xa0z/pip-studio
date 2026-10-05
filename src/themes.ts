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

/** What we store per user: a preset id, or custom background + accent colours. */
export type ThemeChoice = {preset: PresetId} | {preset: 'custom'; bg: string; accent: string};

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

export function resolveTheme(choice: ThemeChoice | null | undefined): VideoTheme {
  if (!choice || choice.preset === 'sage') return SAGE;
  if (choice.preset === 'custom') return deriveTheme(choice.bg, choice.accent);
  const p = PRESETS[choice.preset];
  return p ? deriveTheme(p.bg, p.accent) : SAGE;
}

export function themeLabel(choice: ThemeChoice | null | undefined): string {
  if (!choice) return PRESETS.sage.label;
  if (choice.preset === 'custom') return `Custom (${choice.bg} and ${choice.accent})`;
  return PRESETS[choice.preset]?.label ?? PRESETS.sage.label;
}

/**
 * Parse "background accent" typed by a user, e.g. "#F2E8DC #A84F2C" or "f2e8dc, a84f2c".
 * Returns an error message when the pair would be hard to read.
 */
export function parseCustomTheme(text: string): {ok: true; choice: ThemeChoice} | {ok: false; error: string} {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) return {ok: false, error: 'two'};
  const [bg, accent] = parts.map(normalizeHex);
  if (!bg || !accent) return {ok: false, error: 'hex'};
  if (contrast(bg, accent) < 2.5) return {ok: false, error: 'contrast'};
  return {ok: true, choice: {preset: 'custom', bg, accent}};
}

export function isThemeChoice(x: unknown): x is ThemeChoice {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  if (c.preset === 'custom') return typeof c.bg === 'string' && typeof c.accent === 'string' && !!normalizeHex(c.bg) && !!normalizeHex(c.accent);
  return typeof c.preset === 'string' && c.preset in PRESETS;
}
