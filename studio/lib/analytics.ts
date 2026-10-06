/** Turns stored snapshots into the numbers shown by /stats, /top, /report and the dashboard. */
import {goalScore, type Goal} from './goals.js';
import {
  dailyAccount, dailyTotals, dayKeys, engagementRate, growth, heatmap, latest, median, monthTable, sumLast, velocity24h, viralScores,
  type Snapshot,
} from './metrics.js';
import {MIN_VIDEOS_FOR_PATTERNS, type PatternItem} from './patterns.js';
import {localParts, slotsBetween} from './schedule.js';
import type {Store} from './store.js';
import type {AccountMetricRow, PatternRow, SettingsRow, TikTokRow, VideoRow} from './types.js';

export type Range = 7 | 30 | 90 | 'all';

export type VideoStat = {
  id: string;
  caption: string;
  topic: string;
  thumb: string | null;
  shareUrl: string | null;
  playable: boolean;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
  velocity24h: number | null;
  viral: boolean;
  ratio: number | null;
  experiment: boolean;
  hookType: string | null;
  score: number;
};

export type Analytics = {
  settings: SettingsRow | null;
  tiktok: TikTokRow | null;
  posted: VideoRow[];
  snaps: Map<string, Snapshot[]>;
  account: AccountMetricRow[];
  pattern: PatternRow | null;
  tz: string;
  goal: Goal;
};

export async function loadAnalytics(store: Store, userId: number): Promise<Analytics> {
  const [settings, tiktok, posted, account, pattern] = await Promise.all([
    store.getSettings(userId),
    store.getTikTok(userId),
    store.listVideos(userId, {status: ['posted']}),
    store.listAccountMetrics(userId),
    store.latestPattern(userId),
  ]);
  const metrics = await store.listVideoMetrics(posted.map((v) => v.id));
  const snaps = new Map<string, Snapshot[]>();
  for (const m of metrics) {
    if (!snaps.has(m.video_id)) snaps.set(m.video_id, []);
    snaps.get(m.video_id)!.push(m);
  }
  return {settings, tiktok, posted, snaps, account, pattern, tz: settings?.timezone ?? 'UTC', goal: settings?.goal ?? 'views'};
}

/** The video can be played in the dashboard: its file is still in storage, or Telegram has a copy. */
export const isPlayable = (v: VideoRow) => !!(v.video_path || v.plan?.tg_file_id);

export function videoStats(a: Analytics, thumb: (v: VideoRow) => string | null = () => null): VideoStat[] {
  const base = a.posted.map((v) => {
    const s = a.snaps.get(v.id) ?? [];
    const l = latest(s) ?? {views: 0, likes: 0, comments: 0, shares: 0};
    return {v, s, l};
  });
  const viral = viralScores(base.map((b) => ({id: b.v.id, views: b.l.views})));
  return base.map(({v, s, l}) => ({
    id: v.id,
    caption: v.caption ?? '',
    topic: v.plan?.topic ?? '',
    thumb: thumb(v),
    shareUrl: v.share_url,
    playable: isPlayable(v),
    postedAt: v.posted_at ?? v.slot_at,
    views: l.views,
    likes: l.likes,
    comments: l.comments,
    shares: l.shares,
    engagement: engagementRate(l),
    velocity24h: velocity24h(s),
    viral: viral.get(v.id)?.viral ?? false,
    ratio: viral.get(v.id)?.ratio ?? null,
    experiment: v.is_experiment,
    hookType: v.features?.hook_type ?? null,
    score: goalScore(a.goal, l),
  }));
}

export function buildDashboard(a: Analytics, range: Range, now = new Date(), thumb?: (v: VideoRow) => string | null) {
  const tz = a.tz;
  const firstData = Math.min(
    ...a.account.map((s) => new Date(s.captured_at).getTime()),
    ...a.posted.map((v) => new Date(v.posted_at ?? v.slot_at).getTime()),
    now.getTime(),
  );
  const from = range === 'all' ? new Date(firstData) : new Date(now.getTime() - (range - 1) * 86400000);
  const days = dayKeys(from, now, tz);
  const allDays = dayKeys(new Date(Math.min(firstData, from.getTime())), now, tz);
  const vids = a.posted.map((v) => ({snaps: a.snaps.get(v.id) ?? []}));
  const dailyAll = dailyTotals(vids, allDays, tz);
  const accountAll = dailyAccount(a.account, allDays, tz);
  const pick = <T extends {day: string}>(rows: T[]) => rows.filter((r) => days.includes(r.day));
  const daily = pick(dailyAll);
  const acct = pick(accountAll);

  // Days before the first account snapshot have no follower number (null = gap in the chart, not a drop to 0).
  const firstSnap = a.account.length ? Math.min(...a.account.map((s) => new Date(s.captured_at).getTime())) : null;
  const firstDay = firstSnap === null ? null : (() => {
    const p = localParts(new Date(firstSnap), tz);
    return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  })();
  const series = days.map((day, i) => {
    const d = daily[i];
    return {day, followers: firstDay !== null && day >= firstDay ? acct[i]?.followers ?? 0 : null, newFollowers: acct[i]?.newFollowers ?? 0, views: d.views, likes: d.likes, engagement: d.views ? (d.likes + d.comments + d.shares) / d.views : 0};
  });

  const stats = videoStats(a, thumb);
  const inRange = stats.filter((s) => range === 'all' || new Date(s.postedAt) >= from);
  const lastAcct = a.account.at(-1);
  const followersSeries = accountAll.map((x) => x.followers);
  const views = daily.reduce((n, d) => n + d.views, 0);
  const likes = daily.reduce((n, d) => n + d.likes, 0);
  const inter = daily.reduce((n, d) => n + d.likes + d.comments + d.shares, 0);
  const prevSlice = (key: 'views' | 'likes') => {
    const n = days.length;
    const idx = dailyAll.length - n;
    return dailyAll.slice(Math.max(0, idx - n), Math.max(0, idx)).reduce((s, d) => s + d[key], 0);
  };

  const groupScore = (key: (s: VideoStat, v: VideoRow) => string | undefined) => {
    const g = new Map<string, number[]>();
    stats.forEach((s, i) => {
      const k = key(s, a.posted[i]);
      if (!k) return;
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(s.views);
    });
    return [...g.entries()].map(([label, xs]) => ({label, medianViews: median(xs), n: xs.length})).sort((x, y) => y.medianViews - x.medianViews).slice(0, 6);
  };

  return {
    generatedAt: now.toISOString(),
    range,
    timezone: tz,
    goal: a.goal,
    account: {
      username: a.tiktok?.username ?? null,
      displayName: a.tiktok?.display_name ?? null,
      avatar: a.tiktok?.avatar_url ?? null,
      followers: lastAcct?.followers ?? 0,
      likes: lastAcct?.likes ?? 0,
      videoCount: lastAcct?.video_count ?? 0,
    },
    kpis: {
      followers: {value: lastAcct?.followers ?? 0, change: range === 'all' ? growth(followersSeries).month : (acct.at(-1)?.followers ?? 0) - (acct.find((x) => x.followers > 0)?.followers ?? 0)},
      views: {value: views, prev: prevSlice('views')},
      likes: {value: likes, prev: prevSlice('likes')},
      engagement: {value: views ? inter / views : 0},
      growth: {
        followers: growth(followersSeries),
        views: {day: sumLast(dailyAll.map((d) => d.views), 1), week: sumLast(dailyAll.map((d) => d.views), 7), month: sumLast(dailyAll.map((d) => d.views), 30)},
        likes: {day: sumLast(dailyAll.map((d) => d.likes), 1), week: sumLast(dailyAll.map((d) => d.likes), 7), month: sumLast(dailyAll.map((d) => d.likes), 30)},
      },
    },
    series,
    months: monthTable(dailyAll, accountAll, a.posted.map((v) => {
      const p = localParts(new Date(v.posted_at ?? v.slot_at), tz);
      return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    })),
    videos: inRange,
    insights: {
      n: stats.length,
      minVideos: MIN_VIDEOS_FOR_PATTERNS,
      tooSmall: stats.length < MIN_VIDEOS_FOR_PATTERNS,
      summary: a.pattern?.summary ?? null,
      weekStart: a.pattern?.week_start ?? null,
      patterns: (a.pattern?.items ?? []) as PatternItem[],
      changes: a.pattern?.changes ?? [],
      heatmap: heatmap(
        a.posted.map((v, i) => {
          const p = localParts(new Date(v.posted_at ?? v.slot_at), tz);
          return {weekday: p.weekday, hour: p.hour, score: stats[i].views};
        }),
      ),
      bestTopics: groupScore((_s, v) => v.features?.category ?? v.plan?.category),
      bestHooks: groupScore((s) => s.hookType ?? undefined),
    },
  };
}

export type Dashboard = ReturnType<typeof buildDashboard>;

/** Videos that are made but not posted yet, plus the next posting slot. Shown on the dashboard. */
export const UPCOMING_STATUSES = ['planned', 'rendering', 'awaiting_approval', 'approved', 'publishing'] as const;

export function buildSchedule(settings: SettingsRow | null, upcoming: VideoRow[], now = new Date()) {
  const times = settings?.post_times ?? [];
  const tz = settings?.timezone ?? 'UTC';
  const soon = upcoming
    .filter((v) => (UPCOMING_STATUSES as readonly string[]).includes(v.status) && !v.is_dry_run && new Date(v.slot_at).getTime() > now.getTime() - 3 * 3600000)
    .sort((a, b) => a.slot_at.localeCompare(b.slot_at))
    .slice(0, 6)
    .map((v) => ({id: v.id, slotAt: v.slot_at, status: v.status, topic: (v.plan?.topic as string | undefined) ?? null}));
  const nextSlot = times.length ? slotsBetween(times, tz, now, new Date(now.getTime() + 8 * 86400000))[0]?.toISOString() ?? null : null;
  return {times, postsPerDay: settings?.posts_per_day ?? times.length, mode: settings?.mode ?? 'approval', nextSlot, upcoming: soon};
}

export type Schedule = ReturnType<typeof buildSchedule>;

/** Made videos that are not on TikTok (waiting, skipped, failed, test videos). The Library shows them next to the posted ones. */
export const UNPOSTED_STATUSES = ['rendering', 'awaiting_approval', 'approved', 'publishing', 'skipped', 'failed'] as const;

export function buildUnposted(videos: VideoRow[], thumb?: (v: VideoRow) => string | null) {
  return videos
    .filter((v) => (UNPOSTED_STATUSES as readonly string[]).includes(v.status) && (v.status === 'rendering' || v.plan?.topic || v.thumb_path || v.video_path))
    .map((v) => ({
      id: v.id,
      topic: (v.plan?.topic as string | undefined) ?? null,
      caption: (v.caption ?? '').split('\n')[0],
      at: v.is_dry_run ? v.created_at : v.slot_at,
      status: v.status,
      test: v.is_dry_run,
      thumb: thumb?.(v) ?? null,
      playable: isPlayable(v),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export type Unposted = ReturnType<typeof buildUnposted>;
export type DashboardResponse = Dashboard & {schedule: Schedule; unposted: Unposted; playToken: string};
