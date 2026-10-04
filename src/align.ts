import type {Word} from './schema.js';

export type Heard = {text: string; start: number; end: number};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Gives every script word a time, using what Whisper heard.
 * Words are matched in order (longest common subsequence); words Whisper missed or
 * misheard get times spread between their matched neighbours. Subtitles always show
 * the exact script words.
 */
export function alignWords(script: string[], heard: Heard[], clipStart: number, clipEnd: number): Word[] {
  const a = script.map(norm);
  const b = heard.map((h) => norm(h.text));
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const match: (Heard | null)[] = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] && a[i] === b[j]) {
      match[i] = heard[j];
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  const out: Word[] = script.map((text, i) => ({text, start: match[i]?.start ?? NaN, end: match[i]?.end ?? NaN}));
  // Fill gaps by spreading unmatched words over the time between anchors, weighted by length.
  let i = 0;
  while (i < n) {
    if (!Number.isNaN(out[i].start)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && Number.isNaN(out[j].start)) j++;
    const from = i > 0 ? out[i - 1].end : clipStart;
    const to = j < n ? out[j].start : clipEnd;
    const weights = out.slice(i, j).map((w) => Math.max(2, w.text.length));
    const total = weights.reduce((x, y) => x + y, 0);
    let t = from;
    for (let k = i; k < j; k++) {
      const d = ((to - from) * weights[k - i]) / total;
      out[k].start = t;
      out[k].end = t + d;
      t += d;
    }
    i = j;
  }
  // Keep times inside the clip and in order.
  for (let k = 0; k < n; k++) {
    out[k].start = Math.min(Math.max(out[k].start, k ? out[k - 1].start : clipStart), clipEnd);
    out[k].end = Math.min(Math.max(out[k].end, out[k].start + 0.05), clipEnd);
  }
  return out;
}
