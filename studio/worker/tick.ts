/**
 * The scheduler, run by GitHub Actions cron every 15 minutes:
 * minutes check -> plan upcoming slots -> publish due videos -> metric snapshots -> weekly reports -> cleanup.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publishVideo} from '../../src/publish.js';
import {sleep} from '../../src/util.js';
import {K} from '../bot/keyboards.js';
import {T} from '../bot/texts.js';
import {CHECKPOINTS, dueCheckpoint} from '../lib/metrics.js';
import {isExperiment} from '../lib/patterns.js';
import {localParts, localToUtc, slotsBetween} from '../lib/schedule.js';
import {signState} from '../lib/state.js';
import {monthKey} from '../lib/store.js';
import {accessTokenFor, authorizeUrl, fetchUser, listVideos, queryVideos, TikTokReconnectNeeded} from '../lib/tiktok.js';
import type {MarketingInput, UserRow, VideoRow} from '../lib/types.js';
import {ASK_HOUR, briefFor, dayLabel, localDay, nextDay, refIndexForSlot} from '../lib/marketing.js';
import {redact} from '../lib/redact.js';
import type {WorkerCtx} from './context.js';
import {plainReason} from './jobs.js';

/** Videos are planned this far ahead of their slot, so rendering (10 to 15 min) and approval fit. */
export const LEAD_MINUTES = 75;
const TIKTOK_PAUSE_MS = 400; // between TikTok API calls, to stay far below rate limits

export type TickReport = {planned: number; published: number; failed: number; snapshots: number; accountSnapshots: number; weekly: number; minutes: number | null};

export async function tick(ctx: WorkerCtx, opts: {actionsMinutes?: () => Promise<number | null>} = {}): Promise<TickReport> {
  const report: TickReport = {planned: 0, published: 0, failed: 0, snapshots: 0, accountSnapshots: 0, weekly: 0, minutes: null};
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.error(`tick: ${name} failed: ${redact((e as Error).stack ?? String(e))}`);
    }
  };
  await step('quota', async () => {
    report.minutes = await checkQuota(ctx, opts.actionsMinutes);
  });
  await step('plan', async () => {
    report.planned = await planUpcoming(ctx);
  });
  await step('marketing', async () => {
    await askForReferences(ctx);
  });
  await step('publish', async () => {
    const r = await publishDue(ctx);
    report.published = r.published;
    report.failed = r.failed;
  });
  await step('metrics', async () => {
    const r = await collectMetrics(ctx);
    report.snapshots = r.videos;
    report.accountSnapshots = r.accounts;
  });
  await step('weekly', async () => {
    report.weekly = await weeklyReports(ctx);
  });
  await step('cleanup', () => cleanup(ctx));
  return report;
}

// ---------- GitHub minutes ----------
/** This month's Actions minutes from the GitHub API (all workflows in this repo). Null if not available. */
export async function actionsMinutesFromGitHub(now = new Date()): Promise<number | null> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return null;
  const month = now.toISOString().slice(0, 7);
  let minutes = 0;
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?created=>=${month}-01&per_page=100&page=${page}`, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json'},
    });
    if (!res.ok) return null;
    const {workflow_runs: runs} = (await res.json()) as {workflow_runs: {run_started_at: string; updated_at: string; status: string}[]};
    for (const r of runs) {
      const end = r.status === 'completed' ? new Date(r.updated_at) : now;
      // GitHub bills each job rounded up to the minute; one job per run here.
      minutes += Math.ceil(Math.max(0, end.getTime() - new Date(r.run_started_at).getTime()) / 60000);
    }
    if (runs.length < 100) break;
  }
  return minutes;
}

export async function checkQuota(ctx: WorkerCtx, read?: () => Promise<number | null>): Promise<number> {
  const month = monthKey(ctx.now());
  const usage = await ctx.store.getUsage(month);
  // Limit 0 = no limit (public repos get free Actions minutes).
  if (ctx.minutesLimit <= 0) return Number(usage?.actions_minutes ?? 0);
  const fromApi = read ? await read() : null;
  const minutes = Math.max(fromApi ?? 0, Number(usage?.actions_minutes ?? 0));
  if (fromApi !== null && fromApi > Number(usage?.actions_minutes ?? 0)) await ctx.store.updateUsage(month, {actions_minutes: fromApi});

  // New month: wake up everyone the quota paused.
  const quotaPaused = await ctx.store.listUsers(['paused_quota']);
  if (minutes < ctx.minutesLimit && quotaPaused.length) {
    for (const u of quotaPaused) {
      await ctx.store.updateUser(u.id, {status: 'active'});
      await ctx.msg.text(u.id, T.resumed()).catch(() => undefined);
    }
  }
  if (minutes >= ctx.minutesLimit && !usage?.paused_at) {
    const active = (await ctx.store.listUsers(['active'])).filter((u) => u.id !== ctx.ownerId && !u.is_owner);
    for (const u of active) {
      await ctx.store.updateUser(u.id, {status: 'paused_quota'});
      await ctx.msg.text(u.id, T.pausedQuota()).catch(() => undefined);
    }
    await ctx.store.updateUsage(month, {paused_at: ctx.now().toISOString(), warned_at: usage?.warned_at ?? ctx.now().toISOString()});
    if (ctx.ownerId) {
      await ctx.msg
        .text(ctx.ownerId, `⚠️ GitHub Actions used about <b>${Math.round(minutes)}</b> minutes this month (limit ${ctx.minutesLimit}). I paused ${active.length} user${active.length === 1 ? '' : 's'} who are not you until the 1st. Your own channel keeps running.`)
        .catch(() => undefined);
    }
  }
  return minutes;
}

// ---------- planning ----------
export async function planUpcoming(ctx: WorkerCtx): Promise<number> {
  const now = ctx.now();
  let planned = 0;
  for (const u of await ctx.store.listUsers(['active'])) {
    const s = await ctx.store.getSettings(u.id);
    if (!s) continue;
    const slots = slotsBetween(s.post_times, s.timezone, now, new Date(now.getTime() + LEAD_MINUTES * 60000));
    if (!slots.length) continue;
    const existing = await ctx.store.listVideos(u.id, {limit: 50});
    const realCount = existing.filter((v) => ['posted', 'approved', 'awaiting_approval', 'publishing'].includes(v.status)).length;
    const marketing = u.onboarding_data?.content_mode === 'marketing';
    for (const slot of slots) {
      const iso = slot.toISOString();
      if (existing.some((v) => v.slot_at === iso)) continue; // already made (or skipped/failed) for this slot
      // Marketing videos copy one of the day's reference videos; no references yet means nothing to make.
      let mk: MarketingInput | null = null;
      if (marketing) {
        const day = localDay(slot, s.timezone);
        const found = briefFor(u.onboarding_data.marketing_briefs, day);
        if (!found || !u.onboarding_data.business) continue;
        const index = refIndexForSlot(slot, s.post_times, s.timezone, found.brief.refs.length);
        mk = {business: u.onboarding_data.business, ref: found.brief.refs[index], notes: found.brief.notes, day, index};
      }
      const character = await ctx.store.getLockedCharacter(u.id);
      let v: VideoRow;
      try {
        v = await ctx.store.insertVideo({user_id: u.id, slot_at: iso, status: 'planned', character_id: character?.id ?? null, is_experiment: !mk && isExperiment(realCount + planned), ...(mk ? {plan: {marketing: mk}} : {})});
      } catch {
        continue; // another tick got there first
      }
      const job = await ctx.store.insertJob({kind: 'render', user_id: u.id, video_id: v.id, input: {}});
      try {
        await ctx.dispatch(job.id);
        planned++;
      } catch (e) {
        await ctx.store.updateJob(job.id, {status: 'failed', log: redact((e as Error).message)});
        await ctx.store.updateVideo(v.id, {status: 'failed', error: 'could not start the render job'});
      }
    }
  }
  return planned;
}

// ---------- marketing: ask for tomorrow's references once a day ----------
export async function askForReferences(ctx: WorkerCtx): Promise<number> {
  let asked = 0;
  for (const u of await ctx.store.listUsers(['active'])) {
    const d = u.onboarding_data ?? {};
    if (d.content_mode !== 'marketing' || u.onboarding_step < 7) continue;
    const s = await ctx.store.getSettings(u.id);
    if (!s) continue;
    const now = ctx.now();
    const today = localDay(now, s.timezone);
    if (localParts(now, s.timezone).hour < ASK_HOUR || d.marketing_asked === today) continue;
    const tomorrow = nextDay(today);
    if ((d.marketing_briefs ?? []).some((b) => b.day === tomorrow)) continue;
    await ctx.store.updateUser(u.id, {onboarding_data: {...d, marketing_asked: today}});
    await ctx.msg.text(u.id, T.dailyRefs(dayLabel(tomorrow)), K.dailyRefs(!!(d.marketing_briefs ?? []).length)).catch(() => undefined);
    asked++;
  }
  return asked;
}

// ---------- publishing ----------
export async function publishDue(ctx: WorkerCtx): Promise<{published: number; failed: number}> {
  const now = ctx.now();
  let published = 0;
  let failed = 0;
  const waiting = await ctx.store.videosByStatus(['approved', 'awaiting_approval']);
  for (const v of waiting) {
    if (v.is_dry_run) continue;
    const u = await ctx.store.getUser(v.user_id);
    if (!u || u.status !== 'active') continue;
    if (v.status === 'awaiting_approval') {
      // Nobody answered for 24 h after the slot: drop it.
      if (now.getTime() - new Date(v.slot_at).getTime() > 24 * 3600000) {
        await ctx.store.updateVideo(v.id, {status: 'skipped', error: 'not approved in time', video_path: null});
        if (v.video_path) await ctx.store.removeFiles([v.video_path]).catch(() => undefined);
      }
      continue;
    }
    if (new Date(v.slot_at).getTime() > now.getTime() + 2 * 60000) continue; // not yet
    const ok = await publishOne(ctx, u, v);
    if (ok) published++;
    else failed++;
  }
  return {published, failed};
}

export async function publishOne(ctx: WorkerCtx, u: UserRow, v: VideoRow): Promise<boolean> {
  const {store, msg} = ctx;
  await store.updateVideo(v.id, {status: 'publishing', attempts: v.attempts + 1});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-pub-'));
  try {
    if (!v.video_path) throw new Error('no rendered video');
    const file = path.join(tmp, 'video.mp4');
    fs.writeFileSync(file, await store.download(v.video_path));
    // Refresh the token before every post (creator_info is checked inside publishVideo).
    const {token, row} = await accessTokenFor(store, u.id, {force: true, now: ctx.now()});
    const pub = await publishVideo(file, v.caption ?? '', token, {privacy: v.privacy ?? 'SELF_ONLY', durationSec: v.duration_s ?? 62, mode: 'direct'});
    const postId = pub.postIds[0] ?? null;
    const shareUrl = postId ? `https://www.tiktok.com/@${pub.username || row.username}/video/${postId}` : null;
    await store.updateVideo(v.id, {
      status: 'posted',
      posted_at: ctx.now().toISOString(),
      tiktok_publish_id: pub.publishId,
      tiktok_video_id: postId,
      share_url: shareUrl,
      privacy: pub.privacy,
      error: null,
    });
    await store.removeFiles([v.video_path]).catch(() => undefined);
    await store.updateVideo(v.id, {video_path: null});
    const caption = T.posted((v.caption ?? '').split('\n')[0], pub.privacy);
    // Private posts get no public id from TikTok: link the profile until the metrics step finds the video.
    const link = shareUrl ?? (pub.username || row.username ? `https://www.tiktok.com/@${pub.username || row.username}` : null);
    if (!v.plan?.tg_file_id) {
      // Full auto: the user has not seen this video yet, so send the video itself (and keep its id for "My videos").
      const sent = await msg.video(u.id, file, caption, K.openTikTok(link)).catch((e) => {
        console.warn(`could not send posted video ${v.id}: ${redact((e as Error).message)}`);
        return null;
      });
      if (sent) {
        if (sent.fileId) await store.updateVideo(v.id, {plan: {...(v.plan ?? {}), tg_file_id: sent.fileId}});
        return true;
      }
    }
    if (v.thumb_path) {
      const thumb = await store.download(v.thumb_path).catch(() => null);
      if (thumb) await msg.photo(u.id, thumb, caption, K.openTikTok(link));
      else await msg.text(u.id, caption, K.openTikTok(link));
    } else await msg.text(u.id, caption, K.openTikTok(link));
    return true;
  } catch (e) {
    const err = redact((e as Error).message);
    console.error(`publish ${v.id} failed: ${err}`);
    // An annotation shows the reason on the run page (and through the API) without opening the log.
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Publish failed::video ${v.id}: ${err.replace(/[\r\n]+/g, ' ').slice(0, 400)}`);
    await store.updateVideo(v.id, {status: 'failed', error: err.slice(0, 500)});
    const s = await store.getSettings(u.id);
    const when = new Date(v.slot_at);
    const p = localParts(when, s?.timezone ?? 'UTC');
    const label = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    if (e instanceof TikTokReconnectNeeded) await msg.text(u.id, T.reconnect(), K.connectTikTok(authorizeUrl(signState(u.id))));
    else await msg.text(u.id, T.failed(label, plainReason(err)), K.retry(`retry:${v.id}`));
    return false;
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

// ---------- metrics ----------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);

export async function collectMetrics(ctx: WorkerCtx): Promise<{videos: number; accounts: number}> {
  const now = ctx.now();
  let videos = 0;
  let accounts = 0;
  const users = await ctx.store.listUsers(['active', 'paused', 'paused_quota']);
  const since = new Date(now.getTime() - (CHECKPOINTS.at(-1)!.hours + 24) * 3600000).toISOString();
  const posted = await ctx.store.postedSince(since);

  for (const u of users) {
    const tt = await ctx.store.getTikTok(u.id);
    if (!tt) continue;
    let token: string;
    try {
      ({token} = await accessTokenFor(ctx.store, u.id, {now: ctx.now()}));
    } catch {
      continue; // reconnect message is sent when they next try to post
    }

    // Account stats every 6 hours.
    const last = (await ctx.store.listAccountMetrics(u.id, new Date(now.getTime() - 6 * 3600000 + 5 * 60000).toISOString())).at(-1);
    if (!last) {
      try {
        const me = await fetchUser(token);
        await ctx.store.insertAccountMetric({user_id: u.id, captured_at: now.toISOString(), followers: me.follower_count ?? 0, following: me.following_count ?? 0, likes: me.likes_count ?? 0, video_count: me.video_count ?? 0});
        accounts++;
      } catch (e) {
        console.warn(`account stats for user failed: ${redact((e as Error).message)}`);
      }
      await sleep(TIKTOK_PAUSE_MS);
    }

    // Video snapshots at 1h, 6h, 24h, 3d, 7d, then daily to day 30.
    const mine = posted.filter((v) => v.user_id === u.id && v.posted_at);
    if (!mine.length) continue;
    const metrics = await ctx.store.listVideoMetrics(mine.map((v) => v.id));
    const due = mine
      .map((v) => ({v, cp: dueCheckpoint(new Date(v.posted_at!), now, new Set(metrics.filter((m) => m.video_id === v.id).map((m) => m.checkpoint)))}))
      .filter((x) => x.cp);
    if (!due.length) continue;

    // Private (SELF_ONLY) posts don't return an id when published: find them in the video list.
    if (due.some((x) => !x.v.tiktok_video_id)) {
      try {
        const list = await listVideos(token, 2);
        for (const x of due.filter((d) => !d.v.tiktok_video_id)) {
          const postedAt = new Date(x.v.posted_at!).getTime() / 1000;
          const cap = norm((x.v.caption ?? '').split('\n')[0]);
          const match = list.find((t) => Math.abs(t.create_time - postedAt) < 1800 && norm(t.video_description ?? t.title ?? '').startsWith(cap.slice(0, 20)));
          if (match) {
            x.v.tiktok_video_id = match.id;
            x.v.share_url = match.share_url ?? x.v.share_url;
            await ctx.store.updateVideo(x.v.id, {tiktok_video_id: match.id, share_url: x.v.share_url});
          }
        }
      } catch (e) {
        console.warn(`video list failed: ${redact((e as Error).message)}`);
      }
      await sleep(TIKTOK_PAUSE_MS);
    }
    const ids = due.map((x) => x.v.tiktok_video_id).filter(Boolean) as string[];
    if (!ids.length) continue;
    try {
      const found = await queryVideos(token, ids);
      for (const x of due) {
        const t = found.find((f) => f.id === x.v.tiktok_video_id);
        if (!t) continue;
        await ctx.store.insertVideoMetric({video_id: x.v.id, checkpoint: x.cp!, captured_at: now.toISOString(), views: t.view_count ?? 0, likes: t.like_count ?? 0, comments: t.comment_count ?? 0, shares: t.share_count ?? 0});
        videos++;
      }
    } catch (e) {
      console.warn(`video query failed: ${redact((e as Error).message)}`);
    }
    await sleep(TIKTOK_PAUSE_MS);
  }
  return {videos, accounts};
}

// ---------- weekly ----------
/** Monday of the user's local week, as YYYY-MM-DD. */
export function weekStart(now: Date, tz: string): string {
  const p = localParts(now, tz);
  const back = (p.weekday + 6) % 7;
  const monday = localToUtc(p.y, p.m, p.d - back, '12:00', tz);
  const q = localParts(monday, tz);
  return `${q.y}-${String(q.m + 1).padStart(2, '0')}-${String(q.d).padStart(2, '0')}`;
}

export async function weeklyReports(ctx: WorkerCtx): Promise<number> {
  let n = 0;
  for (const u of await ctx.store.listUsers(['active'])) {
    const s = await ctx.store.getSettings(u.id);
    if (!s) continue;
    const p = localParts(ctx.now(), s.timezone);
    if (p.weekday !== 1 || p.hour < 9) continue; // Mondays from 09:00 local
    const week = weekStart(ctx.now(), s.timezone);
    const latest = await ctx.store.latestPattern(u.id);
    if (latest?.week_start === week) continue;
    const pending = await ctx.store.listJobs({userId: u.id, kind: ['weekly_analysis'], status: ['queued', 'running']});
    if (pending.some((j) => j.input.week_start === week)) continue;
    const posted = await ctx.store.listVideos(u.id, {status: ['posted'], limit: 1});
    if (!posted.length) continue;
    const job = await ctx.store.insertJob({kind: 'weekly_analysis', user_id: u.id, input: {week_start: week}});
    await ctx.dispatch(job.id).catch(async (e) => ctx.store.updateJob(job.id, {status: 'failed', log: redact((e as Error).message)}));
    n++;
  }
  return n;
}

// ---------- cleanup ----------
export async function cleanup(ctx: WorkerCtx) {
  const now = ctx.now().getTime();
  // Jobs that never finished (runner died): fail them so the user gets a Retry button.
  for (const j of await ctx.store.listJobs({status: ['running', 'queued']})) {
    const t = new Date(j.started_at ?? j.created_at).getTime();
    if (now - t > 90 * 60000) {
      const {fail} = await import('./jobs.js');
      await fail(ctx, j.id, 'the job took too long');
    }
  }
  // Rendered files of videos that will never be posted.
  for (const v of await ctx.store.videosByStatus(['skipped', 'failed'])) {
    if (v.video_path && now - new Date(v.updated_at ?? v.created_at).getTime() > 48 * 3600000) {
      await ctx.store.removeFiles([v.video_path]).catch(() => undefined);
      await ctx.store.updateVideo(v.id, {video_path: null});
    }
  }
}
