/** Script to lines, and line timings to shot cuts. Pure functions, so they are easy to test. */

export type Line = {text: string; section: number};
export type TimedLine = Line & {start: number; end: number}; // seconds; end = when the next line starts
export type Cut = {start: number; end: number; line: number; firstOfLine: boolean};

export const MIN_SHOT = 1.2;
export const MAX_SHOT = 3.5;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Splits a script into spoken lines. Blank lines start a new section (short transitions only go
 * between sections). Without blank lines, every two or three lines make a section.
 * Long sentences are split at a comma so each line stays short.
 */
export function splitScript(script: string): Line[] {
  const paras = script
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const explicitSections = paras.length > 1;
  const out: Line[] = [];
  paras.forEach((p, pi) => {
    const sentences = p
      .split(/\n+/)
      .flatMap((l) => l.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sentences) {
      if (words(s) <= 18) {
        out.push({text: s, section: pi});
        continue;
      }
      // Split at the comma closest to the middle.
      const parts = s.split(/,\s+/);
      if (parts.length < 2) {
        out.push({text: s, section: pi});
        continue;
      }
      let best = 1;
      let bestGap = Infinity;
      for (let i = 1; i < parts.length; i++) {
        const left = words(parts.slice(0, i).join(', '));
        const gap = Math.abs(left - words(s) / 2);
        if (gap < bestGap) [best, bestGap] = [i, gap];
      }
      out.push({text: parts.slice(0, best).join(', ') + ',', section: pi}, {text: parts.slice(best).join(', '), section: pi});
    }
  });
  if (!explicitSections) {
    // Sections of 2 or 3 lines, alternating, so the rhythm is not regular.
    let s = 0;
    let left = 2;
    for (const l of out) {
      l.section = s;
      if (--left === 0) {
        s++;
        left = s % 2 ? 3 : 2;
      }
    }
  }
  return out;
}

/** Nearest beat to t within `reach` seconds, else t. */
export const snap = (t: number, beats: number[], reach = 0.22) => {
  let best = t;
  let gap = reach;
  for (const b of beats) {
    const g = Math.abs(b - t);
    if (g < gap) [best, gap] = [b, g];
  }
  return best;
};

/**
 * Cuts for the whole video. Every line starts on a new shot (cut a few frames before the word, like an editor
 * would). Long lines get more shots of uneven length between 1.2 and 3.5 s. Cuts inside a line move to the nearest
 * music beat when that keeps every shot in range.
 */
export function planCuts(lines: TimedLine[], totalEnd: number, beats: number[], rand: () => number): Cut[] {
  // Line starts become cut points; lines too short to hold a shot share it with the line before.
  const starts: {t: number; line: number}[] = [];
  lines.forEach((l, i) => {
    const t = i === 0 ? 0 : Math.max(0, l.start - 0.1);
    const prev = starts[starts.length - 1];
    if (!prev || t - prev.t >= MIN_SHOT) starts.push({t, line: i});
  });
  const cuts: Cut[] = [];
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].t : totalEnd;
    const d = end - s.t;
    const lo = Math.ceil(d / MAX_SHOT);
    const hi = Math.max(lo, Math.floor(d / MIN_SHOT));
    // Aim for about 2.4 s a shot, with some spread.
    const k = Math.min(hi, Math.max(lo, Math.round(d / (1.9 + rand() * 1.1))));
    let lens = Array.from({length: k}, () => 0.55 + rand());
    for (let iter = 0; iter < 20; iter++) {
      const sum = lens.reduce((a, b) => a + b, 0);
      lens = lens.map((x) => Math.min(MAX_SHOT, Math.max(MIN_SHOT, (x * d) / sum)));
    }
    // Final exact fit: spread the rounding error over the shots that can take it.
    let t = s.t;
    const points = [t];
    for (let j = 0; j < k - 1; j++) {
      t += lens[j];
      points.push(t);
    }
    points.push(end);
    for (let j = 1; j < points.length - 1; j++) {
      const moved = snap(points[j], beats);
      if (moved - points[j - 1] >= MIN_SHOT && points[j + 1] - moved >= MIN_SHOT && moved - points[j - 1] <= MAX_SHOT && points[j + 1] - moved <= MAX_SHOT) points[j] = moved;
    }
    for (let j = 0; j < points.length - 1; j++) cuts.push({start: points[j], end: points[j + 1], line: s.line, firstOfLine: j === 0});
  });
  return cuts;
}

/** Words that make a line worth a punch-in. */
export const isEmphasis = (text: string) => /\d|!|\b(never|always|only|most|every|biggest|largest|fastest|smallest|secret|actually|really|imagine|wait|why)\b/i.test(text);
