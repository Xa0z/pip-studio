// Regressions for bugs found in the full debug pass (2026-10-07).
import {afterEach, describe, expect, it} from 'vitest';
import {T} from '../studio/bot/texts';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {buildDashboard, type Analytics} from '../studio/lib/analytics';
import {telegramWebhook} from '../studio/server/handlers';
import {tokenize} from '../remotion/scenes/common';
import {buildTimeline, validateTimeline, voiceProblems} from '../src/timeline';

const OWNER = 5550001;
function clock(iso: string) {
  let t = new Date(iso).getTime();
  return {now: () => new Date(t), set: (s: string) => (t = new Date(s).getTime())};
}

let h: Harness;
afterEach(() => h?.close());

describe('worker', () => {
  it('does not plan a failed slot again when the database writes the time as +00:00', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);
    c.set('2026-10-05T07:50:00Z');
    expect((await h.tick()).planned).toBe(1);
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run)!;
    // What Postgres hands back for a failed render of that slot.
    h.store.videos.set(v.id, {...v, status: 'failed', slot_at: '2026-10-05T09:00:00+00:00'});
    c.set('2026-10-05T07:55:00Z');
    expect((await h.tick()).planned).toBe(0);
  });

  it('keeps a video posted when telling the user fails', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now, tiktok: {privacyOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']}});
    await runOnboarding(h);
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run)!;
    await h.press(`ap:pv:${v.id}:0`);
    await h.press(`ap:post:${v.id}`);
    const blocked = async () => {
      throw new Error('Forbidden: bot was blocked by the user');
    };
    Object.assign(h.ctx.msg, {text: blocked, photo: blocked, video: blocked});
    c.set('2026-10-05T08:59:00Z');
    expect((await h.tick()).published).toBe(1);
    expect((await h.store.getVideo(v.id))!.status).toBe('posted');
  });
});

describe('bot', () => {
  it('answers Telegram 200 and tells the user when a handler throws', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    h.store.getUser = async () => {
      throw new Error('Database (get user): connection reset');
    };
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const update = {update_id: 99, message: {message_id: 1, date: 0, chat: {id: OWNER, type: 'private', first_name: 'A'}, from: {id: OWNER, is_bot: false, first_name: 'A'}, text: '/start', entities: [{type: 'bot_command', offset: 0, length: 6}]}};
    const res = await telegramWebhook(h.bot)(
      new Request('https://x/api/telegram', {method: 'POST', headers: {'content-type': 'application/json', ...(secret ? {'X-Telegram-Bot-Api-Secret-Token': secret} : {})}, body: JSON.stringify(update)}),
    );
    expect(res.status).toBe(200);
    expect(h.lastBot()?.text).toMatch(/something went wrong/i);
  });

  it('escapes custom niches in HTML messages', () => {
    const text = T.chooseNiche(['custom:R&B <3']);
    expect(text).toContain('R&amp;B &lt;3');
    expect(text).not.toContain('<3');
  });
});

describe('analytics', () => {
  it('does not count existing followers as new on the first day', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const a: Analytics = {
      settings: null,
      tiktok: null,
      posted: [],
      snaps: new Map(),
      account: [{user_id: 1, captured_at: '2026-10-07T08:00:00Z', followers: 5000, following: 0, likes: 0, video_count: 0}],
      pattern: null,
      tz: 'UTC',
      goal: 'views',
    } as unknown as Analytics;
    const d = buildDashboard(a, 30, now);
    expect(d.kpis.growth.followers).toEqual({day: 0, week: 0, month: 0});
  });
});

describe('video', () => {
  it('never passes a last scene that the timeline check then rejects', () => {
    const plan = {scenes: Array.from({length: 9}, () => ({}))} as never;
    const starts = [0, 3, 9, 15, 21, 27, 33, 40, 46.1, 54.05].slice(0, 9);
    starts[8] = 54.05;
    const voice = {speechEnd: 59.5, sceneStarts: starts, sceneEnds: [2.9, ...starts.slice(2), 59.5]} as never;
    const problems = voiceProblems(plan, voice);
    let threw = false;
    try {
      validateTimeline(buildTimeline(plan, voice));
    } catch {
      threw = true;
    }
    expect(threw ? problems.some((p) => /scene 9/.test(p)) : true).toBe(true);
  });

  it('highlights whole words only', () => {
    expect(tokenize('Sunlight is 8 minutes old', ['Sun']).map((t) => t.text)).toEqual(['Sunlight', 'is', '8', 'minutes', 'old']);
    expect(tokenize('It costs $5 and 62%!', ['$5', '62%'])).toEqual([
      {text: 'It', hi: false},
      {text: 'costs', hi: false},
      {text: '$5', hi: true},
      {text: 'and', hi: false},
      {text: '62%!', hi: true},
    ]);
  });
});
