import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {addBrief, briefFor, checkRef, dayLabel, linkFrom, refIndexForSlot} from '../studio/lib/marketing';
import {studyReference} from '../studio/worker/marketing';

const OWNER = 5550001;
const BUSINESS = 'Bloom Bakery, fresh sourdough and birthday cakes for families and offices. Free delivery on orders over 30 dollars. bloombakery.com';

function clock(iso: string) {
  let t = new Date(iso).getTime();
  return {now: () => new Date(t), set: (s: string) => (t = new Date(s).getTime())};
}

let h: Harness;
afterEach(() => h?.close());

const brief = (day: string, ids: string[], notes = '') => ({day, refs: ids.map((file_id) => ({file_id, duration: 20})), notes, created_at: `${day}T00:00:00Z`});

describe('marketing helpers', () => {
  it('uses the day’s own brief, or the newest earlier one', () => {
    const list = addBrief(addBrief(undefined, brief('2026-10-06', ['a', 'b', 'c'])), brief('2026-10-08', ['d', 'e', 'f']));
    expect(briefFor(list, '2026-10-06')).toMatchObject({reused: false, brief: {day: '2026-10-06'}});
    expect(briefFor(list, '2026-10-07')).toMatchObject({reused: true, brief: {day: '2026-10-06'}});
    expect(briefFor(list, '2026-10-05')).toBeNull();
    // same day again replaces it
    expect(addBrief(list, brief('2026-10-08', ['x', 'y', 'z'])).filter((b) => b.day === '2026-10-08')[0].refs[0].file_id).toBe('x');
  });

  it('gives each post time its own reference', () => {
    const times = ['21:00', '09:00', '15:00'];
    const at = (iso: string) => refIndexForSlot(new Date(iso), times, 'Asia/Baghdad', 3);
    expect([at('2026-10-06T06:00:00Z'), at('2026-10-06T12:00:00Z'), at('2026-10-06T18:00:00Z')]).toEqual([0, 1, 2]);
  });

  it('finds the link and checks reference files', () => {
    expect(linkFrom(BUSINESS)).toBe('https://bloombakery.com');
    expect(linkFrom('Order at https://shop.example.com/cakes.')).toBe('https://shop.example.com/cakes');
    expect(linkFrom('No link here, just cakes')).toBeNull();
    expect(checkRef({file_id: 'x', duration: 30, file_size: 21 * 1024 * 1024}).ok).toBe(false);
    expect(checkRef({file_id: 'x', duration: 400}).ok).toBe(false);
    expect(checkRef({file_id: 'x', mime_type: 'image/png'}).ok).toBe(false);
    expect(checkRef({file_id: 'x', duration: 30, mime_type: 'video/mp4'})).toMatchObject({ok: true, ref: {file_id: 'x', duration: 30}});
    expect(dayLabel('2026-10-07')).toBe('Wed 7 Oct');
  });

  it.skipIf(!hasFfmpeg())('measures a reference video: length, cuts and frames', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-ref-test-'));
    const file = path.join(dir, 'ref.mp4');
    // 3 s of red, then 3 s of blue: one hard cut
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=180x320:d=3', '-f', 'lavfi', '-i', 'color=c=blue:s=180x320:d=3', '-filter_complex', '[0][1]concat=n=2:v=1', '-pix_fmt', 'yuv420p', file]);
    const f = await studyReference(file, path.join(dir, 'out'));
    expect(f.duration).toBeGreaterThan(5.5);
    expect(f.cuts).toBe(1);
    expect(f.frames).toHaveLength(6);
    expect(await studyReference(path.join(dir, 'missing.mp4'), path.join(dir, 'x'))).toEqual({duration: 0, cuts: 0, frames: [], transcript: ''});
  });
});

describe('marketing videos', () => {
  it('collects business info and 3 references, then makes 3 videos the next day, one per reference', async () => {
    const c = clock('2026-10-05T07:00:00Z'); // Monday 10:00 in Baghdad
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);

    await h.say('/marketing');
    expect(h.lastBot()!.text).toMatch(/tell me about your business/i);
    await h.say('cakes');
    expect(h.lastBot()!.text).toMatch(/a bit more/i);
    await h.say(BUSINESS);
    expect(h.botTexts().join('\n')).toMatch(/link in your bio \(https:\/\/bloombakery\.com\)/);
    expect(h.lastBot()!.text).toMatch(/Send 3 reference videos/);
    const s = (await h.store.getSettings(OWNER))!;
    expect(s.posts_per_day).toBe(3);
    expect(s.post_times).toEqual(['09:00', '15:00', '21:00']);
    expect(s.link_url).toBe('https://bloombakery.com');

    await h.say('https://www.tiktok.com/@someone/video/123');
    expect(h.lastBot()!.text).toMatch(/can't open TikTok links/);
    await h.sendVideo('ref-A');
    expect(h.lastBot()!.text).toMatch(/reference 1 of 3/);
    await h.sendVideo('ref-A');
    expect(h.lastBot()!.text).toMatch(/already sent/);
    await h.sendVideo('ref-big', {file_size: 30 * 1024 * 1024});
    expect(h.lastBot()!.text).toMatch(/over 20 MB/);
    await h.sendVideo('ref-B', {asDocument: true});
    await h.sendVideo('ref-C', {duration: 50});
    expect(h.lastBot()!.text).toMatch(/What should I change/);
    await h.say('Mention free delivery over 30 dollars and make it funny');
    expect(h.botTexts().join('\n')).toMatch(/All set for Tue 6 Oct/);
    const d = (await h.user())!.onboarding_data;
    expect(d.marketing_briefs).toHaveLength(1);
    expect(d.marketing_briefs![0]).toMatchObject({day: '2026-10-06', notes: 'Mention free delivery over 30 dollars and make it funny'});
    expect(d.marketing_briefs![0].refs.map((r) => r.file_id)).toEqual(['ref-A', 'ref-B', 'ref-C']);

    // Today has no brief: the 15:00 slot (12:00 UTC) makes nothing.
    c.set('2026-10-05T11:00:00Z');
    expect((await h.tick()).planned).toBe(0);

    // Tomorrow: 09:00, 15:00 and 21:00 Baghdad each get their own reference.
    const made: string[] = [];
    for (const at of ['2026-10-06T05:00:00Z', '2026-10-06T11:00:00Z', '2026-10-06T17:00:00Z']) {
      c.set(at);
      expect((await h.tick()).planned).toBe(1);
      const [r] = await h.runJobs();
      expect(r.ok, r.error).toBe(true);
      made.push(h.downloads.at(-1)!);
    }
    expect(made).toEqual(['ref-A', 'ref-B', 'ref-C']);
    const vids = [...h.store.videos.values()].filter((v) => !v.is_dry_run && v.slot_at.startsWith('2026-10-06'));
    expect(vids).toHaveLength(3);
    for (const v of vids) {
      expect(v.status).toBe('awaiting_approval');
      expect(v.features?.niche).toBe('marketing');
      expect(v.plan.marketing).toMatchObject({business: BUSINESS, notes: expect.stringMatching(/free delivery/)});
      expect(v.duration_s).toBe(v.plan.marketing.ref.file_id === 'ref-C' ? 45 : 30); // a long reference makes a longer video
      expect(v.plan.scenes.at(-1).narration).toMatch(/link in bio/i);
    }
    expect(vids.find((v) => v.plan.marketing.ref.file_id === 'ref-C')!.plan.marketing.index).toBe(2);

    // Regenerating keeps the same reference.
    const first = vids.find((v) => v.plan.marketing.index === 0)!;
    await h.press(`ap:regen:${first.id}`);
    await h.runJobs();
    const fresh = [...h.store.videos.values()].find((v) => v.slot_at === first.slot_at && v.id !== first.id)!;
    expect(fresh.plan.marketing.ref.file_id).toBe('ref-A');
  });

  it('asks for tomorrow’s references once a day, and can reuse the last ones', async () => {
    const c = clock('2026-10-05T07:00:00Z');
    h = new Harness({userId: OWNER, ownerId: OWNER, now: c.now});
    await runOnboarding(h);
    await h.say('/marketing');
    await h.say(BUSINESS);
    for (const id of ['a', 'b', 'c']) await h.sendVideo(id);
    await h.press('mk:nonotes');
    expect(h.botTexts().join('\n')).toMatch(/All set for Tue 6 Oct/);

    // Tuesday 16:00 Baghdad: too early. 17:30: ask once.
    c.set('2026-10-06T13:00:00Z');
    await h.tick();
    expect(h.botTexts().join('\n')).not.toMatch(/tomorrow's references/);
    c.set('2026-10-06T14:30:00Z');
    await h.tick();
    expect(h.lastBot()!.text).toMatch(/tomorrow's references \(Wed 7 Oct\)/);
    const asks = () => h.botTexts().filter((t) => /tomorrow's references/.test(t)).length;
    await h.tick();
    expect(asks()).toBe(1);

    await h.press('mk:same');
    expect(h.lastBot()!.text).toMatch(/reuse your last references for Wed 7 Oct/);
    const briefs = (await h.user())!.onboarding_data.marketing_briefs!;
    expect(briefs.map((b) => b.day)).toEqual(['2026-10-06', '2026-10-07']);
  });

  it('can be picked during setup instead of a niche, and skips the posts-per-day question', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    await h.say('/start');
    await h.press('ob:go');
    await h.tiktokLogin();
    await h.press('ob:next');
    await h.say('sk-ant-oat01-' + 'x'.repeat(80));
    await h.runJobs();
    await h.press('mk:on');
    await h.say(BUSINESS);
    expect(h.lastBot()!.text).toMatch(/character/i); // goal is skipped
    await h.press('ch:no');
    await h.runJobs();
    await h.press(/^v:/);
    await h.press('th:sage');
    await h.press('tz:0');
    expect(h.lastBot()!.text).not.toMatch(/How many/i);
    await h.press('tm:ok');
    await h.press('m:approval');
    await h.press('sum:start');
    expect(h.lastBot()!.text).toMatch(/Send 3 reference videos/);
    expect(h.queue).toHaveLength(0); // no explainer test video
    const s = (await h.store.getSettings(OWNER))!;
    expect(s.posts_per_day).toBe(3);
    expect((await h.user())!.onboarding_data.content_mode).toBe('marketing');
  });
});

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}
