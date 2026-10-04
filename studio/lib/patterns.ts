/** Finds what the best videos have in common (top 20% vs bottom 20%). */
export const MIN_VIDEOS_FOR_PATTERNS = 15;
export const EXPERIMENT_EVERY = 5; // 1 in 5 = 20% of videos try something new

export type VideoFeatures = {
  niche?: string;
  topic?: string;
  category?: string;
  hook_text?: string;
  hook_type?: string;
  layouts?: string[];
  length_s?: number;
  local_hour?: number;
  weekday?: number;
  caption_style?: string;
  hashtags?: string[];
  cta_type?: string;
};

export type Scored = {id: string; features: VideoFeatures; score: number};

export type PatternItem = {feature: string; value: string; lift: number; n: number; inTop: number; inBottom: number; text: string};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Feature values used for grouping. Hours are grouped in 3-hour blocks so groups are not too thin. */
export function featureValues(f: VideoFeatures): Record<string, string | undefined> {
  const hourBlock = f.local_hour === undefined ? undefined : `${String(Math.floor(f.local_hour / 3) * 3).padStart(2, '0')}:00`;
  const len = f.length_s === undefined ? undefined : f.length_s >= 60 ? '60+ s' : f.length_s >= 45 ? '45-59 s' : '30-44 s';
  return {
    hook_type: f.hook_type,
    niche: f.niche,
    category: f.category,
    post_time: hourBlock,
    weekday: f.weekday === undefined ? undefined : WEEKDAYS[f.weekday],
    length: len,
    caption_style: f.caption_style,
    first_layout: f.layouts?.[0],
    cta_type: f.cta_type,
  };
}

const describe = (feature: string, value: string, lift: number) => {
  const x = `${lift.toFixed(1)}x`;
  switch (feature) {
    case 'hook_type':
      return `"${value}" hooks score ${x} your average`;
    case 'post_time':
      return `Posts around ${value} score ${x} your average`;
    case 'weekday':
      return `${value} posts score ${x} your average`;
    case 'length':
      return `${value} videos score ${x} your average`;
    case 'first_layout':
      return `Starting with a "${value}" visual scores ${x} your average`;
    default:
      return `${feature.replace('_', ' ')} "${value}" scores ${x} your average`;
  }
};

export function findPatterns(videos: Scored[]): {tooSmall: boolean; n: number; items: PatternItem[]} {
  const n = videos.length;
  const tooSmall = n < MIN_VIDEOS_FOR_PATTERNS;
  if (n < 2) return {tooSmall, n, items: []};
  const sorted = [...videos].sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.round(n * 0.2));
  const top = new Set(sorted.slice(0, k).map((v) => v.id));
  const bottom = new Set(sorted.slice(-k).map((v) => v.id));
  const mean = videos.reduce((s, v) => s + v.score, 0) / n || 1;

  const groups = new Map<string, Scored[]>();
  for (const v of videos) {
    for (const [feature, value] of Object.entries(featureValues(v.features))) {
      if (value === undefined || value === '') continue;
      const key = `${feature}\u0000${value}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
  }
  const items: PatternItem[] = [];
  for (const [key, list] of groups) {
    const [feature, value] = key.split('\u0000');
    if (list.length < 2 || list.length === n) continue; // a value every video has tells us nothing
    const lift = list.reduce((s, v) => s + v.score, 0) / list.length / mean;
    items.push({
      feature,
      value,
      lift: Math.round(lift * 100) / 100,
      n: list.length,
      inTop: list.filter((v) => top.has(v.id)).length,
      inBottom: list.filter((v) => bottom.has(v.id)).length,
      text: describe(feature, value, lift),
    });
  }
  // Strongest first: big lift in either direction, backed by more videos.
  items.sort((a, b) => Math.abs(Math.log(b.lift || 0.01)) * Math.sqrt(b.n) - Math.abs(Math.log(a.lift || 0.01)) * Math.sqrt(a.n));
  return {tooSmall, n, items: items.slice(0, 12)};
}

/** Planner guidance from patterns: what to do more of and what to avoid. */
export function plannerHints(items: PatternItem[], tooSmall: boolean): string[] {
  const good = items.filter((i) => i.lift >= 1.3 && i.n >= 3).slice(0, 4);
  const bad = items.filter((i) => i.lift <= 0.7 && i.n >= 3).slice(0, 3);
  const hints = [...good.map((i) => `Do more: ${i.text}.`), ...bad.map((i) => `Do less: ${i.text}.`)];
  if (tooSmall && hints.length) hints.unshift('These patterns come from fewer than 15 videos, so treat them as early guesses.');
  return hints;
}

/** Every 5th video is an experiment (new topic or hook style), so the system keeps learning. */
export const isExperiment = (videoIndex: number) => videoIndex % EXPERIMENT_EVERY === EXPERIMENT_EVERY - 1;
