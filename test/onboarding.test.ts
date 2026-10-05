import {afterEach, describe, expect, it} from 'vitest';
import {decryptSecret, aadFor} from '../studio/lib/crypto';
import {Harness, runOnboarding} from '../studio/dev/harness';
import {signState} from '../studio/lib/state';
import {tiktokCallback} from '../studio/server/handlers';

const OWNER = 5550001;
const OAUTH = 'sk-ant-oat01-' + 'x'.repeat(80);
const API_KEY = 'sk-ant-api03-' + 'k'.repeat(80);

let h: Harness;
afterEach(() => h?.close());

describe('onboarding (owner, with a character)', () => {
  it('runs all 6 steps and makes a test video that is not posted', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    const results = await runOnboarding(h);
    expect(results.every((r) => r.ok)).toBe(true);

    const texts = h.botTexts().join('\n');
    for (let n = 1; n <= 6; n++) expect(texts).toContain(`Step ${n} of 6`);
    expect(texts).toContain('Connected as');
    expect(texts).toContain('@nova.facts');

    // Claude token: message deleted, stored encrypted, checked by a GitHub job
    const tokenMsg = h.chat.find((m) => m.from === 'user' && m.text === OAUTH)!;
    expect(tokenMsg.deleted).toBe(true);
    const cred = await h.store.getClaude(OWNER);
    expect(cred!.kind).toBe('oauth_token');
    expect(cred!.secret_enc).not.toContain('sk-ant');
    expect(decryptSecret(cred!.secret_enc, aadFor.claude(OWNER))).toBe(OAUTH);
    expect(cred!.last_check_ok).toBe(true);
    expect(texts).toContain('Claude token works');

    // TikTok tokens encrypted
    const tt = await h.store.getTikTok(OWNER);
    expect(tt!.access_token_enc.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(tt)).not.toMatch(/act\.fake|rft\.fake/);

    // Character: 3 versions as an album, one locked with its voice, never changed after
    const album = h.chat.find((m) => m.kind === 'album')!;
    expect(album.media).toHaveLength(3);
    const locked = await h.store.getLockedCharacter(OWNER);
    expect(locked!.name).toBe('Nova');
    expect(locked!.voice_id).toBe('af_bella');
    expect(locked!.code).toContain('export const Character');
    await expect(h.store.updateCharacter(locked!.id, {code: 'changed'})).rejects.toThrow();

    // Settings saved, channel active
    const s = await h.store.getSettings(OWNER);
    expect(s).toMatchObject({niches: ['science', 'history'], goal: 'creator_rewards', timezone: 'Asia/Baghdad', posts_per_day: 2, post_times: ['12:00', '20:00'], mode: 'approval'});
    const u = await h.user();
    expect(u!.status).toBe('active');
    expect(u!.onboarding_step).toBe(7);

    // Dry run: sent to Telegram, never to TikTok
    const preview = h.lastBot('video')!;
    expect(preview.text).toMatch(/not.*posted/);
    expect(preview.buttons!.flat().map((b) => b.callback_data)).toEqual(['pv:ok', 'pv:again']);
    const dry = [...h.store.videos.values()].find((v) => v.is_dry_run)!;
    expect(dry.status).toBe('skipped');
    expect(dry.duration_s).toBe(62);
    expect(dry.plan!.scenes.at(-1)!.narration).toMatch(/Follow Nova/);
    expect(h.tiktok.calls.some((c) => c.path.includes('/post/publish/video/init'))).toBe(false);

    await h.press('pv:ok');
    expect(h.lastBot()!.text).toContain('Your channel is running');
  });
});

describe('onboarding (other users)', () => {
  it('rejects subscription tokens and bad keys, accepts a good API key, deletes every secret message', async () => {
    h = new Harness({userId: 777, ownerId: OWNER});
    await h.say('/start');
    await h.press('ob:go');
    await h.tiktokLogin();
    await h.press('ob:next');
    expect(h.lastBot()!.text).toMatch(/API key/i);
    await h.say(OAUTH);
    expect(h.lastBot()!.text).toMatch(/subscription|API key/i);
    await h.say('sk-ant-api03-bad' + 'b'.repeat(60));
    expect(h.lastBot()!.text).toMatch(/rejected/);
    await h.say(API_KEY);
    expect(h.botTexts().join('\n')).toMatch(/Claude works|connected/i);
    for (const m of h.chat.filter((x) => x.from === 'user' && x.text?.startsWith('sk-ant'))) expect(m.deleted).toBe(true);
    expect((await h.store.getClaude(777))!.kind).toBe('api_key');
    expect(h.lastBot()!.text).toContain('Step 3 of 6');
  });

  it('allows max 2 niches, a custom niche, and refuses famous characters', async () => {
    h = new Harness({userId: 778, ownerId: OWNER});
    await h.say('/start');
    await h.press('ob:go');
    await h.tiktokLogin();
    await h.press('ob:next');
    await h.say(API_KEY);
    await h.press('n:custom');
    await h.say('Cooking tips');
    await h.press('n:money');
    await h.press('n:tech');
    expect(h.lastBot('alert')!.text).toMatch(/2/);
    await h.press('n:done');
    expect((await h.user())!.onboarding_data.niches).toEqual(['custom:Cooking tips', 'money']);
    await h.press('g:followers');
    await h.press('ch:yes');
    await h.say('Mickey Mouse in a lab coat');
    expect(h.lastBot()!.text).toMatch(/belongs to someone else/);
    expect(h.queue).toHaveLength(0);
  });

  it('works with no character, and keeps non-owners on Approval mode', async () => {
    h = new Harness({userId: 779, ownerId: OWNER});
    const r = await runOnboarding(h, {claudeSecret: API_KEY, character: null, goal: 'views', mode: 'auto', postsPerDay: 1});
    expect(r.every((x) => x.ok)).toBe(true);
    const s = await h.store.getSettings(779);
    expect(s!.mode).toBe('approval');
    expect(h.botTexts().join('\n')).toMatch(/Full auto/);
    const c = await h.store.getLockedCharacter(779);
    expect(c!.code).toBeNull();
    expect(c!.voice_id).toBeTruthy();
    const dry = [...h.store.videos.values()].find((v) => v.is_dry_run)!;
    expect(dry.status).toBe('skipped');
  });

  it('saves progress so the user can stop and continue', async () => {
    h = new Harness({userId: 780, ownerId: OWNER});
    await h.say('/start');
    await h.press('ob:go');
    await h.tiktokLogin();
    await h.press('ob:next');
    await h.say(API_KEY);
    await h.press('n:animals');
    await h.say('/start');
    const t = h.botTexts().slice(-2).join('\n');
    expect(t).toMatch(/Welcome back|continue/i);
    expect(t).toContain('Step 3 of 6');
    expect((await h.user())!.onboarding_data.niches).toEqual(['animals']);
  });

  it('lets the user edit an answer from the summary', async () => {
    h = new Harness({userId: 781, ownerId: OWNER});
    await h.say('/start');
    await h.press('ob:go');
    await h.tiktokLogin();
    await h.press('ob:next');
    await h.say(API_KEY);
    await h.press('n:science');
    await h.press('n:done');
    await h.press('g:views');
    await h.press('ch:no');
    await h.runJobs();
    await h.press(/^v:/);
    await h.press('th:sage');
    await h.press('tz:0');
    await h.press('ppd:1');
    await h.press('tm:edit');
    await h.say('07:30');
    await h.press('m:approval');
    expect(h.lastBot()!.text).toContain('07:30');
    await h.press('sum:edit');
    await h.press('ed:goal');
    await h.press('g:followers');
    expect(h.lastBot()!.buttons!.flat().some((b) => b.callback_data === 'sum:start')).toBe(true);
    expect((await h.user())!.onboarding_data.goal).toBe('followers');
  });
});

describe('TikTok login', () => {
  it('rejects an expired or forged state and a bad code', async () => {
    h = new Harness({userId: 790});
    await h.say('/start');
    const old = signState(790, Date.now() - 11 * 60000);
    const r1 = await tiktokCallback(new Request(`https://x/api/tiktok/callback?code=good-code&state=${old}`), h.store, h.bot.api);
    expect(r1.status).toBe(400);
    expect(await r1.text()).toMatch(/expired/);
    const r2 = await tiktokCallback(new Request(`https://x/api/tiktok/callback?code=good-code&state=abc.def`), h.store, h.bot.api);
    expect(r2.status).toBe(400);
    await h.press('ob:go');
    const r3 = await h.tiktokLogin('bad-code');
    expect(r3.status).toBeGreaterThanOrEqual(400);
    expect(await h.store.getTikTok(790)).toBeNull();
    expect(h.lastBot()!.text).toMatch(/failed/i);
  });

  it('uses the right scopes and redirect', async () => {
    const {authorizeUrl, SCOPES} = await import('../studio/lib/tiktok');
    const u = new URL(authorizeUrl('st'));
    expect(u.searchParams.get('scope')!.split(',')).toEqual(SCOPES);
    expect(SCOPES).toEqual(['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish']);
    expect(u.searchParams.get('redirect_uri')).toBe('https://pip-studio.example.com/api/tiktok/callback');
  });
});
