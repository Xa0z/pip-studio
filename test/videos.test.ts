import {afterEach, describe, expect, it} from 'vitest';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {signInitData} from '../studio/lib/initdata';
import {dashboardApi, dashboardSend} from '../studio/server/handlers';

const OWNER = 5550001;
const USER = 5550002;

function clock(iso: string) {
  let t = new Date(iso).getTime();
  return {now: () => new Date(t), set: (s: string) => (t = new Date(s).getTime())};
}

let h: Harness;
afterEach(() => h?.close());

describe('my videos and posting mode', () => {
  it('lists made videos, plays them again, and switches between review and full auto', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);

    await h.say('/videos');
    expect(h.lastBot()!.text).toMatch(/Your videos<\/b> \(1\)/); // the test video from setup

    // One video made and waiting for approval: Telegram's id for it is kept.
    c.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run)!;
    expect(v.status).toBe('awaiting_approval');
    expect(v.plan.tg_file_id).toMatch(/^tgvid-/);

    await h.say('/videos');
    const list = h.lastBot()!;
    expect(list.text).toMatch(/Your videos<\/b> \(2\)/);
    expect(list.text).toMatch(/Review and approve/);
    expect(list.buttons!.flat().map((b) => b.text)).toContain('⚡ Switch to full auto');

    // Watching it: the video comes back by its Telegram id, with the approval buttons.
    await h.press(`vd:show:${v.id}`);
    const shown = h.lastBot('video')!;
    expect(shown.text).toMatch(/Waiting for your OK/);
    expect(shown.media![0]).toBe(v.plan.tg_file_id);
    expect(shown.buttons!.flat().map((b) => b.callback_data)).toContain(`ap:post:${v.id}`);

    // Switch to full auto from the list: the list refreshes and the waiting video still needs an OK.
    await h.press('md:auto:0');
    expect((await h.store.getSettings(OWNER))!.mode).toBe('auto');
    expect(h.botTexts().join('\n')).toMatch(/Full auto is on.*The video already waiting still needs your OK/s);
    expect(list.buttons!.flat().map((b) => b.text)).toContain('✋ Switch to review and approve');

    // In full auto the next video posts by itself and the posted video is sent to the chat.
    await h.press(`ap:pv:${v.id}:0`);
    await h.press(`ap:skip:${v.id}`);
    c.set('2026-10-05T15:50:00Z');
    await h.tick();
    await h.runJobs();
    const auto = [...h.store.videos.values()].find((x) => !x.is_dry_run && x.id !== v.id)!;
    expect(auto.status).toBe('approved');
    expect(auto.plan.tg_file_id).toBeUndefined();
    c.set('2026-10-05T16:59:00Z');
    expect((await h.tick()).published).toBe(1);
    const posted = (await h.store.getVideo(auto.id))!;
    expect(posted.status).toBe('posted');
    expect(posted.plan.tg_file_id).toMatch(/^tgvid-/);
    expect(h.lastBot()!.kind).toBe('video');
    expect(h.lastBot()!.text).toMatch(/Posted/);

    // The dashboard Library has every video: the posted one, plus the skipped one and the test video.
    const init = signInitData({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id: OWNER, first_name: 'Ahmad'})}, process.env.TELEGRAM_BOT_TOKEN!);
    const res = await dashboardApi(new Request('https://x/api/dashboard?range=30', {headers: {'x-telegram-init-data': init}}), h.store, process.env.TELEGRAM_BOT_TOKEN!, c.now());
    const d = await res.json();
    expect(d.videos.map((x: any) => x.id)).toEqual([auto.id]);
    expect(d.unposted.map((x: any) => [x.status, x.test])).toEqual(
      expect.arrayContaining([
        ['skipped', false],
        ['skipped', true],
      ]),
    );
    // Tapping a video that is not on TikTok sends it to the chat.
    const before = h.chat.length;
    const sent = await dashboardSend(new Request('https://x/api/dashboard', {method: 'POST', headers: {'x-telegram-init-data': init}, body: JSON.stringify({send: v.id})}), h.store, process.env.TELEGRAM_BOT_TOKEN!, h.bot.api);
    expect(await sent.json()).toEqual({ok: true, sent: 'video'});
    expect(h.chat.slice(before).find((m) => m.kind === 'video')!.text).toMatch(/Not posted/);
    const other = signInitData({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id: 42})}, process.env.TELEGRAM_BOT_TOKEN!);
    expect((await dashboardSend(new Request('https://x/api/dashboard', {method: 'POST', headers: {'x-telegram-init-data': other}, body: JSON.stringify({send: v.id})}), h.store, process.env.TELEGRAM_BOT_TOKEN!, h.bot.api)).status).toBe(404);

    // The bot's /videos list has them all too.
    await h.say('/videos');
    expect(h.lastBot()!.text).toMatch(/Your videos<\/b> \(3\)/);
    expect(h.lastBot()!.buttons!.flat().map((b) => b.text).join('\n')).toMatch(/🧪/);

    // /mode switches back.
    await h.say('/mode');
    expect(h.lastBot()!.text).toMatch(/Full auto<\/b> is on/);
    await h.press('md:approval');
    expect((await h.store.getSettings(OWNER))!.mode).toBe('approval');
    expect((await h.user())!.onboarding_data.mode).toBe('approval');
  });

  it('shows a short home menu with buttons on /start once set up', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER, now: () => new Date('2026-10-05T07:00:00Z')});
    await runOnboarding(h);
    await h.say('/start');
    const home = h.lastBot()!;
    expect(home.text).toMatch(/Pip Studio.*@nova\.facts/);
    expect(home.text).toMatch(/Next post: Mon 12:00/);
    expect(home.text!.split('\n').length).toBeLessThan(8);
    const data = home.buttons!.flat().map((b) => b.callback_data ?? b.web_app?.url);
    expect(data).toEqual(expect.arrayContaining(['vd:list:0', 'md:menu', 'hm:stats', 'hm:top', 'hm:settings', 'mk:menu', 'hm:pause', 'hm:help']));

    await h.press('hm:pause');
    expect((await h.user())!.status).toBe('paused');
    await h.press('hm:home');
    expect(h.lastBot()!.text).toMatch(/Paused/);
    await h.press('hm:resume');
    expect((await h.user())!.status).toBe('active');
    await h.say('/nonsense');
    expect(h.lastBot()!.text).toMatch(/don't know that command/);
    await h.say('hello');
    expect(h.lastBot()!.text).toMatch(/🏠/);
  });

  it('keeps full auto for the owner until it is allowed for everyone', async () => {
    h = new Harness({userId: USER, ownerId: OWNER, now: () => new Date('2026-10-05T07:00:00Z')});
    await runOnboarding(h, {claudeSecret: 'sk-ant-api03-' + 'k'.repeat(80)});
    await h.say('/mode');
    await h.press('md:auto');
    expect(h.lastBot('alert')!.text).toMatch(/not available yet/);
    expect((await h.store.getSettings(USER))!.mode).toBe('approval');
  });
});
