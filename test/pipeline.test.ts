import {afterEach, describe, expect, it} from 'vitest';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {signInitData} from '../studio/lib/initdata';
import {dashboardApi} from '../studio/server/handlers';

const OWNER = 5550001;
const API_KEY = 'sk-ant-api03-' + 'k'.repeat(80);

function clock(iso: string) {
  let t = new Date(iso).getTime();
  return {now: () => new Date(t), set: (s: string) => (t = new Date(s).getTime()), add: (min: number) => (t += min * 60000)};
}

let h: Harness;
afterEach(() => h?.close());

describe('daily pipeline (approval mode)', () => {
  it('plans ahead, waits for approval, posts with the AI label, then collects metrics', async () => {
    const c = clock('2026-10-05T07:00:00Z'); // Monday 10:00 in Baghdad
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now, tiktok: {privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY']}});
    await runOnboarding(h); // 12:00 and 20:00 Baghdad = 09:00 and 17:00 UTC

    // 07:50 UTC: the 09:00 slot is within 75 minutes, so it gets planned and rendered
    c.set('2026-10-05T07:50:00Z');
    expect((await h.tick()).planned).toBe(1);
    expect(h.queue).toHaveLength(1);
    expect((await h.runJobs())[0].ok).toBe(true);
    const v0 = [...h.store.videos.values()].find((v) => !v.is_dry_run)!;
    expect(v0.status).toBe('awaiting_approval');
    expect(v0.slot_at).toBe('2026-10-05T09:00:00.000Z');
    expect(v0.features).toMatchObject({niche: 'science', hook_type: 'shock', length_s: 62, local_hour: 12, weekday: 1});
    // a second tick does not plan the same slot again
    expect((await h.tick()).planned).toBe(0);

    // Approval message: video, caption, AI label note, privacy picker with nothing chosen
    const ap = h.lastBot('video')!;
    expect(ap.text).toMatch(/AI-generated/i);
    expect(ap.text).toMatch(/Music Usage Confirmation/i);
    const privacy = ap.buttons![0];
    expect(privacy.map((b) => b.text)).not.toContain(expect.stringContaining('✅'));
    await h.press(`ap:post:${v0.id}`);
    expect(h.lastBot('alert')!.text).toMatch(/who can see it/i);
    await h.press(`ap:pv:${v0.id}:0`);
    await h.press(`ap:post:${v0.id}`);
    expect((await h.store.getVideo(v0.id))!.status).toBe('approved');

    // 08:50: not yet. 08:59: posts.
    c.set('2026-10-05T08:50:00Z');
    expect((await h.tick()).published).toBe(0);
    const refreshBefore = h.tiktok.calls.filter((x) => x.body?.grant_type === 'refresh_token').length;
    c.set('2026-10-05T08:59:00Z');
    expect((await h.tick()).published).toBe(1);

    const init = h.tiktok.calls.find((x) => x.path === '/v2/post/publish/video/init/')!;
    expect(init.body.post_info.is_aigc).toBe(true);
    expect(init.body.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE');
    expect(h.tiktok.calls.filter((x) => x.path === '/v2/post/publish/creator_info/query/').length).toBeGreaterThanOrEqual(2);
    expect(h.tiktok.calls.filter((x) => x.body?.grant_type === 'refresh_token').length).toBe(refreshBefore + 1);

    const posted = (await h.store.getVideo(v0.id))!;
    expect(posted.status).toBe('posted');
    expect(posted.share_url).toMatch(/^https:\/\/www\.tiktok\.com\/@nova\.facts\/video\/\d+$/);
    expect(posted.video_path && h.store.files.has(posted.video_path)).toBeFalsy(); // mp4 removed after posting
    const done = h.lastBot()!;
    expect(done.text).toMatch(/Posted/);
    expect(done.buttons!.flat()[0].url).toBe(posted.share_url);

    // Metrics: 1h, then 24h; the account every 6 h
    h.tiktok.posts[0].views = 420;
    h.tiktok.posts[0].likes = 51;
    c.set('2026-10-05T10:05:00Z');
    const t1 = await h.tick();
    expect(t1.snapshots).toBe(1);
    h.tiktok.posts[0].views = 5100;
    h.tiktok.posts[0].likes = 600;
    h.tiktok.followers = 180;
    c.set('2026-10-06T09:10:00Z');
    const t2 = await h.tick();
    expect(t2.snapshots).toBe(1);
    expect(t2.accountSnapshots).toBe(1);
    const snaps = await h.store.listVideoMetrics([v0.id]);
    expect(snaps.map((s) => [s.checkpoint, s.views])).toEqual([['1h', 420], ['24h', 5100]]);

    // /stats and /top
    await h.say('/stats');
    expect(h.lastBot()!.text).toMatch(/180/);
    await h.say('/top');
    expect(h.lastBot()!.text).toMatch(/Top 5 by views/);

    // Dashboard API: needs valid initData
    const bad = await dashboardApi(new Request('https://x/api/dashboard?range=7'), h.store, process.env.TELEGRAM_BOT_TOKEN!);
    expect(bad.status).toBe(401);
    const init2 = signInitData({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id: OWNER, first_name: 'Ahmad'})}, process.env.TELEGRAM_BOT_TOKEN!);
    const res = await dashboardApi(new Request('https://x/api/dashboard?range=7', {headers: {'x-telegram-init-data': init2}}), h.store, process.env.TELEGRAM_BOT_TOKEN!, c.now());
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.account.username).toBe('nova.facts');
    expect(d.videos).toHaveLength(1);
    expect(d.videos[0].views).toBe(5100);
    expect(d.insights.tooSmall).toBe(true);
    // no follower numbers before the account was connected (a gap, not a drop to 0)
    expect(d.series[0].followers).toBeNull();
    expect(d.series.at(-1).followers).toBe(180);
    const other = signInitData({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id: 42})}, process.env.TELEGRAM_BOT_TOKEN!);
    expect((await dashboardApi(new Request('https://x/api/dashboard', {headers: {'x-telegram-init-data': other}}), h.store, process.env.TELEGRAM_BOT_TOKEN!)).status).toBe(404);
  });

  it('drops a video nobody approved within 24 hours', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    c.set('2026-10-06T09:30:00Z');
    await h.tick();
    const v = [...h.store.videos.values()].find((x) => x.slot_at === '2026-10-05T09:00:00.000Z')!;
    expect(v.status).toBe('skipped');
    expect(h.tiktok.calls.some((x) => x.path.includes('video/init'))).toBe(false);
  });
});

describe('full auto, failures and limits', () => {
  it('owner in full auto: posts by itself, privacy from creator_info', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now}); // unaudited app: SELF_ONLY only
    await runOnboarding(h, {mode: 'auto'});
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run)!;
    expect(v.status).toBe('approved');
    expect(v.privacy).toBe('SELF_ONLY');
    c.set('2026-10-05T09:00:00Z');
    expect((await h.tick()).published).toBe(1);
    expect(h.lastBot()!.text).toMatch(/Only you/i);
    // private posts have no public id: the metrics step finds them in the video list
    c.set('2026-10-05T10:01:00Z');
    expect((await h.tick()).snapshots).toBe(1);
    expect((await h.store.getVideo(v.id))!.tiktok_video_id).toBeTruthy();
  });

  it('a failed post sends a clear message with a Retry button', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h, {mode: 'auto'});
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    h.tiktok.opts.maxDurationSec = 30; // account can't post 62 s videos
    c.set('2026-10-05T09:00:00Z');
    expect((await h.tick()).failed).toBe(1);
    const m = h.lastBot()!;
    expect(m.text).toMatch(/couldn't|failed|didn't/i);
    expect(m.buttons!.flat()[0].callback_data).toMatch(/^retry:/);
    expect(m.text).not.toMatch(/act\.|Bearer/);
  });

  it('a render failure tells the user and offers Retry', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);
    h.ctx.ask = () => async () => 'not json at all';
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    const r = await h.runJobs();
    expect(r[0].ok).toBe(false);
    expect(h.lastBot()!.buttons!.flat()[0].callback_data).toMatch(/^retry:/);
  });

  it('a job the tick already gave up on is not made twice', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    c.set('2026-10-05T09:30:00Z'); // runner never started; cleanup fails the job and offers Retry
    await h.tick();
    expect(h.lastBot()!.buttons!.flat()[0].callback_data).toMatch(/^retry:/);
    const before = h.chat.length;
    const r = await h.runJobs(); // the late runner finally starts
    expect(r[0].ok).toBe(false);
    expect(h.chat.length).toBe(before);
  });

  it('pauses other users past 1700 GitHub minutes, never the owner', async () => {
    h = new Harness({userId: 779, ownerId: OWNER});
    await runOnboarding(h, {claudeSecret: API_KEY, character: null});
    await h.store.addActionsMinutes(1750);
    await h.tick();
    expect((await h.user())!.status).toBe('paused_quota');
    expect(h.botTexts().join('\n')).toMatch(/paused/i);
  });

  it('/disconnect deletes everything', async () => {
    h = new Harness({userId: 779, ownerId: OWNER});
    await runOnboarding(h, {claudeSecret: API_KEY, character: null});
    await h.say('/disconnect');
    await h.press('dc:yes');
    expect(await h.user()).toBeNull();
    expect(await h.store.getTikTok(779)).toBeNull();
    expect(await h.store.getClaude(779)).toBeNull();
    expect([...h.store.files.keys()].filter((k) => k.includes('/779/'))).toEqual([]);
  });
});
