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

/**
 * What we store per user: a preset id, colours made just for this user ("auto", from a seed),
 * or their own brand colours (background + main colour, and optionally a second colour).
 */
export type ThemeChoice =
  | {preset: PresetId}
  | {preset: 'auto'; seed: number}
  | {preset: 'custom'; bg: string; accent: string; accent2?: string; brand?: boolean};

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

// ---------- colours made for one user ----------
const hsl = (h: number, sat: number, l: number) => {
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return toHex([f(0), f(8), f(4)]);
};

const HUE_NAMES: [number, string][] = [
  [15, 'Brick'], [40, 'Amber'], [65, 'Olive'], [95, 'Moss'], [150, 'Forest'], [185, 'Teal'], [215, 'Ocean'],
  [250, 'Indigo'], [285, 'Violet'], [320, 'Berry'], [345, 'Rose'], [361, 'Brick'],
];
const hueOf = (seed: number) => ((seed >>> 0) * 137.508) % 360;
const hueName = (h: number) => HUE_NAMES.find(([max]) => h < max)![1];

/**
 * A calm, readable palette that belongs to one user: the hue comes from the seed (their Telegram id),
 * so two users almost never share colours. About one in five gets a dark background.
 */
export function autoTheme(seed: number): VideoTheme {
  const h = hueOf(seed);
  const dark = (seed >>> 0) % 5 === 0;
  if (dark) return deriveTheme(hsl(h, 0.16, 0.12), hsl(h, 0.42, 0.7));
  // Accent dark enough for light caption text; background a soft tint of a neighbouring hue.
  let accent = hsl(h, 0.42, 0.33);
  const bg = hsl((h + 18) % 360, 0.28, 0.91);
  for (let l = 0.33; contrast(accent, bg) < 4.5 && l > 0.15; l -= 0.03) accent = hsl(h, 0.42, l);
  return deriveTheme(bg, accent);
}
export const autoThemeName = (seed: number) => `${hueName(hueOf(seed))}${(seed >>> 0) % 5 === 0 ? ' Night' : ''}`;

/** Build the full palette from a background and an accent (and optionally a second brand colour). */
export function deriveTheme(bgIn: string, accentIn: string, accent2In?: string): VideoTheme {
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
    accent2: (accent2In && normalizeHex(accent2In)) || mix(accent, bg, 0.3),
    accentSoft: mix(accent, bg, 0.55),
    marker: mix(accent, bg, 0.72),
    onAccent: contrast(LIGHT_INK, accent) >= contrast(DARK_INK, accent) ? '#F7F6F2' : DARK_INK,
  };
}

export function resolveTheme(choice: ThemeChoice | null | undefined): VideoTheme {
  if (!choice || choice.preset === 'sage') return SAGE;
  if (choice.preset === 'auto') return autoTheme(choice.seed);
  if (choice.preset === 'custom') return deriveTheme(choice.bg, choice.accent, choice.accent2);
  const p = PRESETS[choice.preset];
  return p ? deriveTheme(p.bg, p.accent) : SAGE;
}

export function themeLabel(choice: ThemeChoice | null | undefined): string {
  if (!choice) return PRESETS.sage.label;
  if (choice.preset === 'auto') return `Your own: ${autoThemeName(choice.seed)}`;
  if (choice.preset === 'custom') return `${choice.brand ? 'Brand' : 'Custom'} (${[choice.bg, choice.accent, choice.accent2].filter(Boolean).join(', ')})`;
  return PRESETS[choice.preset]?.label ?? PRESETS.sage.label;
}

/**
 * Parse "background accent" typed by a user, e.g. "#F2E8DC #A84F2C" or "f2e8dc, a84f2c".
 * Returns an error message when the pair would be hard to read.
 */
export function parseCustomTheme(text: string, opts: {brand?: boolean} = {}): {ok: true; choice: ThemeChoice} | {ok: false; error: string} {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > (opts.brand ? 3 : 2)) return {ok: false, error: 'two'};
  const [bg, accent, accent2] = parts.map(normalizeHex);
  if (!bg || !accent || (parts.length === 3 && !accent2)) return {ok: false, error: 'hex'};
  if (contrast(bg, accent) < 2.5) return {ok: false, error: 'contrast'};
  return {ok: true, choice: {preset: 'custom', bg, accent, ...(accent2 && contrast(bg, accent2) >= 1.6 ? {accent2} : {}), ...(opts.brand ? {brand: true} : {})}};
}

/** The theme a user gets when they never picked one: their own colours (the owner keeps Sage). */
export const defaultThemeFor = (userId: number, isOwner = false): ThemeChoice => (isOwner ? {preset: 'sage'} : {preset: 'auto', seed: userId});

/**
 * Brand colours from a logo (raw RGBA pixels): the most common clearly coloured shade becomes the main
 * colour, a different second one (if any) the second colour, and the background is a light tint of the main.
 */
export function brandFromPixels(data: Uint8Array, opts: {step?: number} = {}): ThemeChoice | null {
  const counts = new Map<number, {n: number; r: number; g: number; b: number}>();
  const step = opts.step ?? 4;
  for (let i = 0; i + 3 < data.length; i += 4 * step) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3] ?? 255];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Skip whites, blacks and greys: logos sit on them, they are not the brand colour.
    if (max - min < 40 || max < 40 || min > 225) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(key) ?? {n: 0, r: 0, g: 0, b: 0};
    c.n++, (c.r += r), (c.g += g), (c.b += b);
    counts.set(key, c);
  }
  const ranked = [...counts.values()].filter((c) => c.n >= 3).sort((x, y) => y.n - x.n).map((c) => toHex([c.r / c.n, c.g / c.n, c.b / c.n]));
  if (!ranked.length) return null;
  let accent = ranked[0];
  const second = ranked.find((c) => colourDistance(c, accent) > 90);
  const bg = mix(accent, '#FFFFFF', 0.9);
  // Light brand colours (yellow, mint) get darkened until highlights read on the light background.
  for (let k = 0; contrast(accent, bg) < 3 && k < 12; k++) accent = mix(accent, '#000000', 0.12);
  return {preset: 'custom', bg, accent, ...(second ? {accent2: second} : {}), brand: true};
}

const colourDistance = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

export function isThemeChoice(x: unknown): x is ThemeChoice {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  if (c.preset === 'auto') return typeof c.seed === 'number' && Number.isFinite(c.seed);
  if (c.preset === 'custom')
    return typeof c.bg === 'string' && typeof c.accent === 'string' && !!normalizeHex(c.bg) && !!normalizeHex(c.accent) && (c.accent2 === undefined || (typeof c.accent2 === 'string' && !!normalizeHex(c.accent2)));
  return typeof c.preset === 'string' && c.preset in PRESETS;
}
