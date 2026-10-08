/**
 * Pip Studio Telegram bot (grammY). All state lives in the Store, so it runs fine
 * on serverless (one webhook call per update) and users can stop and continue anytime.
 */
import crypto from 'node:crypto';
import {Api, Bot, InputFile, type Context} from 'grammy';
import type {UserFromGetMe} from 'grammy/types';
import {buildDashboard, loadAnalytics, videoStats} from '../lib/analytics.js';
import {looksLikeApiKey, looksLikeOauthToken, testApiKey as realTestApiKey, type CheckResult} from '../lib/claude-check.js';
import {aadFor, encryptSecret} from '../lib/crypto.js';
import {famousCharacter} from '../lib/copyright.js';
import type {Dispatcher} from '../lib/github.js';
import {GOALS, type Goal} from '../lib/goals.js';
import {fmtNum, fmtPct} from '../lib/metrics.js';
import {NICHES} from '../lib/niches.js';
import {redact} from '../lib/redact.js';
import {MIN_VIDEOS_FOR_PATTERNS} from '../lib/patterns.js';
import {COMMON_TIMEZONES, fmtLocal, localParts, parseTimes, parseTimezone, slotsBetween, suggestTimes} from '../lib/schedule.js';
import {sendVideoCard, shortDay, STATUS_ICON, videoTitle} from './show-video.js';
import {addBrief, checkRef, dayLabel, linkFrom, localDay, nextDay, REFS_PER_DAY} from '../lib/marketing.js';
import {signState} from '../lib/state.js';
import type {Store} from '../lib/store.js';
import type {ChartInput} from '../lib/charts.js';
import type {Keyboard} from '../lib/telegram.js';
import type {TikTokUser} from '../lib/tiktok.js';
import type {JobKind, OnboardingData, SettingsRow, UserRow, VideoRow} from '../lib/types.js';
import {K} from './keyboards.js';
import {esc, T} from './texts.js';
import {parseCustomTheme, PRESETS, themeLabel, type PresetId, type ThemeChoice} from '../../src/themes.js';

export type BotDeps = {
  token: string;
  store: Store;
  dispatch: Dispatcher;
  /** Runs the posting step right away instead of waiting for the (often late) schedule. */
  tickNow?: () => Promise<void>;
  ownerId: number;
  baseUrl: string;
  tiktokAuthUrl: (state: string) => string;
  testApiKey?: (key: string) => Promise<CheckResult>;
  statsChart?: (input: ChartInput) => Promise<Buffer>;
  revokeTikTok?: (userId: number) => Promise<void>;
  botInfo?: UserFromGetMe;
  /** Lets the owner allow Full auto for everyone after TikTok's audit. */
  allowAutoForAll?: boolean;
  now?: () => Date;
};

const kb = (k: Keyboard | undefined) => (k && k.length ? {reply_markup: {inline_keyboard: k as any}} : {});
/** Cuts by characters, so an emoji is never split in half (Telegram rejects broken UTF-16). */
const cut = (s: string, n: number) => [...s].slice(0, n).join('');
const html = (k?: Keyboard) => ({parse_mode: 'HTML' as const, link_preview_options: {is_disabled: true}, ...kb(k)});

export function createBot(deps: BotDeps) {
  const {store} = deps;
  const now = deps.now ?? (() => new Date());
  const bot = new Bot(deps.token, deps.botInfo ? {botInfo: deps.botInfo} : {});
  const testKey = deps.testApiKey ?? realTestApiKey;

  // ---------- helpers ----------
  const getOrCreate = async (ctx: Context): Promise<UserRow> => {
    const from = ctx.from!;
    const u = await store.getUser(from.id);
    if (u) return u;
    return store.createUser({id: from.id, tg_username: from.username ?? null, first_name: from.first_name ?? null, is_owner: from.id === deps.ownerId});
  };
  const data = (u: UserRow): OnboardingData => u.onboarding_data ?? {};
  const patch = async (u: UserRow, p: Partial<OnboardingData>, rest: Partial<UserRow> = {}) =>
    store.updateUser(u.id, {...rest, onboarding_data: {...data(u), ...p}});
  const isOwner = (u: UserRow) => u.is_owner || u.id === deps.ownerId;
  const onboarded = (u: UserRow) => u.onboarding_step >= 7;

  const startJob = async (ctx: Context, u: UserRow, kind: JobKind, input: Record<string, unknown>, videoId?: string) => {
    const job = await store.insertJob({kind, user_id: u.id, video_id: videoId ?? null, input});
    try {
      await deps.dispatch(job.id);
    } catch (e) {
      const why = redact(e instanceof Error ? e.message : String(e));
      console.error(`Could not start ${kind} job ${job.id}: ${why}`);
      await store.updateJob(job.id, {status: 'failed', log: `could not start GitHub job: ${why}`.slice(0, 500)});
      await ctx.reply(T.jobFailed('starting the job'), html(K.retry(`rj:${job.id}`)));
      return null;
    }
    return job;
  };

  // ---------- screens ----------
  const showTikTok = async (ctx: Context, u: UserRow) => {
    const url = deps.tiktokAuthUrl(signState(u.id, now().getTime()));
    await ctx.reply(T.connectTikTok(), html(K.connectTikTok(url)));
  };
  const showClaude = async (ctx: Context, u: UserRow) => {
    await patch(u, {awaiting: 'claude_secret'});
    await ctx.reply(isOwner(u) ? T.connectClaudeOwner() : T.connectClaudeUser(), html(K.claudeHelp(isOwner(u))));
  };
  const showNiche = async (ctx: Context, u: UserRow) => {
    const picked = data(u).niches ?? [];
    await ctx.reply(T.chooseNiche(picked), html(K.niches(picked)));
  };
  const showGoal = (ctx: Context) => ctx.reply(T.chooseGoal(), html(K.goals()));
  const showCharacter = async (ctx: Context) => {
    const u = await getOrCreate(ctx);
    await ctx.reply(T.askCharacter(), html(K.characterYesNo(isOwner(u))));
  };
  const showTimezone = (ctx: Context) => ctx.reply(T.askTimezone(), html(K.timezones()));
  const showPpd = (ctx: Context) => ctx.reply(T.askPostsPerDay(), html(K.postsPerDay()));
  const showMode = (ctx: Context) => ctx.reply(T.askMode(), html(K.mode()));

  const showSummary = async (ctx: Context, u: UserRow) => {
    const d = data(u);
    const tt = await store.getTikTok(u.id);
    const voice = d.voice_id ?? '?';
    await ctx.reply(
      T.summary({
        username: tt?.username ?? '?',
        niches: d.niches ?? [],
        goal: d.goal ?? 'views',
        character: d.has_character ? d.character_name ?? 'your character' : null,
        voice: voiceName(voice),
        theme: themeLabel(d.video_theme),
        times: d.post_times ?? [],
        tz: d.timezone ?? 'UTC',
        mode: d.mode ?? 'approval',
        link: d.link_url,
      }),
      html(K.summary()),
    );
  };

  const showStep = async (ctx: Context, u: UserRow) => {
    const step = u.onboarding_step;
    if (step === 1) return showTikTok(ctx, u);
    if (step === 2) return showClaude(ctx, u);
    if (step === 3) return showNiche(ctx, u);
    if (step === 4) return showGoal(ctx);
    if (step === 5) {
      const d = data(u);
      if (d.pending_job) return ctx.reply(T.stillWorking());
      return showCharacter(ctx);
    }
    if (step === 6) {
      const d = data(u);
      if (!d.timezone) return showTimezone(ctx);
      if (!d.posts_per_day) return showPpd(ctx);
      if (!d.post_times) return showTimes(ctx, u);
      if (!d.mode) return showMode(ctx);
      return showSummary(ctx, u);
    }
    return showHome(ctx, u);
  };

  const showTimes = async (ctx: Context, u: UserRow) => {
    const d = data(u);
    const times = suggestTimes(d.posts_per_day ?? 1);
    await patch(u, {post_times: undefined, voice_options: d.voice_options});
    await ctx.reply(T.suggestTimes(times, d.niches ?? []), html(K.times()));
  };

  const settingsFromData = (u: UserRow, cur: SettingsRow | null): SettingsRow => {
    const d = data(u);
    return {
      user_id: u.id,
      niches: d.niches ?? cur?.niches ?? ['science'],
      goal: d.goal ?? cur?.goal ?? 'views',
      link_url: d.goal === 'traffic' ? d.link_url ?? cur?.link_url ?? null : null,
      timezone: d.timezone ?? cur?.timezone ?? 'UTC',
      posts_per_day: d.posts_per_day ?? cur?.posts_per_day ?? 1,
      post_times: d.post_times ?? cur?.post_times ?? ['19:00'],
      mode: d.mode ?? cur?.mode ?? 'approval',
      experiment_rate: cur?.experiment_rate ?? 0.2,
      privacy_default: cur?.privacy_default ?? null,
    };
  };

  /** Called when one question is answered: go to the next one, or finish an edit. */
  const advance = async (ctx: Context, u: UserRow, after: 'niche' | 'goal' | 'character' | 'theme' | 'tz' | 'ppd' | 'times' | 'mode') => {
    const d = data(u);
    const editing = d.editing;
    const chain: Record<string, string | null> = editing
      ? {niche: null, goal: null, character: null, theme: null, mode: null, tz: 'ppd', ppd: 'times', times: null}
      : {niche: 'goal', goal: 'character', character: 'theme', theme: 'tz', tz: 'ppd', ppd: 'times', times: 'mode', mode: 'summary'};
    let nextScreen = chain[after];
    if (nextScreen === 'ppd' && d.content_mode === 'marketing') {
      u = await patch(u, {posts_per_day: 3});
      nextScreen = 'times';
    }
    if (!editing) {
      const stepFor: Record<string, number> = {goal: 4, character: 5, tz: 6};
      if (nextScreen && stepFor[nextScreen] && u.onboarding_step < stepFor[nextScreen]) u = await store.updateUser(u.id, {onboarding_step: stepFor[nextScreen]});
    }
    if (nextScreen === 'goal') return showGoal(ctx);
    if (nextScreen === 'character') return showCharacter(ctx);
    if (nextScreen === 'theme') return showTheme(ctx, u);
    if (nextScreen === 'tz') return showTimezone(ctx);
    if (nextScreen === 'ppd') return showPpd(ctx);
    if (nextScreen === 'times') return showTimes(ctx, u);
    if (nextScreen === 'mode') return showMode(ctx);
    if (nextScreen === 'summary') return showSummary(ctx, u);
    // finished an edit
    u = await patch(u, {editing: null, awaiting: null});
    if (onboarded(u)) {
      await store.saveSettings(settingsFromData(u, await store.getSettings(u.id)));
      await ctx.reply(T.saved(), html(K.settings()));
    } else {
      await showSummary(ctx, u);
    }
  };

  // ---------- /start ----------
  bot.command('start', async (ctx) => {
    const existing = await store.getUser(ctx.from!.id);
    const u = existing ?? (await getOrCreate(ctx));
    if (!existing) return ctx.reply(T.welcome(ctx.from!.first_name ?? 'there'), html(K.letsGo()));
    if (onboarded(u)) return showHome(ctx, u);
    await ctx.reply(T.welcomeBack(u.onboarding_step));
    return showStep(ctx, u);
  });
  bot.callbackQuery('ob:go', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showStep(ctx, await getOrCreate(ctx));
  });
  bot.callbackQuery('ob:next', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showStep(ctx, await getOrCreate(ctx));
  });

  // ---------- step 2: Claude ----------
  bot.callbackQuery('cl:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(T.claudeGuide(), html());
  });
  bot.callbackQuery('cl:again', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await getOrCreate(ctx);
    await patch(u, {awaiting: 'claude_secret'});
    await ctx.reply(isOwner(u) ? T.connectClaudeOwner() : T.connectClaudeUser(), html());
  });

  const onClaudeSecret = async (ctx: Context, u: UserRow, text: string) => {
    // Delete the message first, whatever it contains.
    await ctx.deleteMessage().catch(() => undefined);
    const secret = text.trim();
    const owner = isOwner(u);
    const isOauth = looksLikeOauthToken(secret);
    const isKey = looksLikeApiKey(secret);
    if (!owner && isOauth) return ctx.reply(T.claudeSubscriptionNotAllowed(), html());
    if (!isOauth && !isKey) return ctx.reply(T.claudeWrongKind(owner), html());
    const kind = isOauth ? 'oauth_token' : 'api_key';
    const save = (ok: boolean | null) =>
      store.saveClaude({user_id: u.id, kind, secret_enc: encryptSecret(secret, aadFor.claude(u.id)), last_checked_at: ok === null ? null : now().toISOString(), last_check_ok: ok});

    if (kind === 'api_key') {
      await ctx.reply(T.claudeDeleted());
      const r = await testKey(secret);
      if (!r.ok) return ctx.reply(T.claudeBad(r.reason), html());
      await save(true);
      await ctx.reply(T.claudeOk(), html());
    } else {
      // A Claude Code token can only be tested by running Claude Code, which happens on GitHub.
      await save(null);
      await ctx.reply(T.claudeOwnerTesting(), html());
      await startJob(ctx, u, 'claude_check', {});
    }
    u = await patch(u, {awaiting: null}, u.onboarding_step === 2 ? {onboarding_step: 3} : {});
    if (u.onboarding_step === 3 && !onboarded(u)) await showNiche(ctx, u);
  };

  // ---------- step 3: niche ----------
  bot.callbackQuery(/^n:(.+)$/, async (ctx) => {
    const u = await getOrCreate(ctx);
    const id = ctx.match[1];
    const picked = [...(data(u).niches ?? [])];
    if (id === 'done') {
      if (!picked.length) return ctx.answerCallbackQuery({text: T.nicheNeedOne(), show_alert: true});
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
      return advance(ctx, data(u).awaiting === 'custom_niche' ? await patch(u, {awaiting: null}) : u, 'niche');
    }
    if (id === 'custom') {
      const existing = picked.findIndex((p) => p.startsWith('custom:'));
      if (existing >= 0) {
        picked.splice(existing, 1);
        await patch(u, {niches: picked});
        await ctx.answerCallbackQuery();
        return ctx.editMessageText(T.chooseNiche(picked), html(K.niches(picked)));
      }
      if (picked.length >= 2) return ctx.answerCallbackQuery({text: T.nicheMax(), show_alert: true});
      await patch(u, {awaiting: 'custom_niche'});
      await ctx.answerCallbackQuery();
      return ctx.reply(T.customNiche());
    }
    if (!NICHES.some((n) => n.id === id)) return ctx.answerCallbackQuery();
    const i = picked.indexOf(id);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length >= 2) return ctx.answerCallbackQuery({text: T.nicheMax(), show_alert: true});
    else picked.push(id);
    await patch(u, {niches: picked});
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(T.chooseNiche(picked), html(K.niches(picked)));
  });

  const onCustomNiche = async (ctx: Context, u: UserRow, text: string) => {
    const t = text.trim().replace(/\s+/g, ' ');
    if (t.length < 3 || t.length > 40) return ctx.reply(T.customNicheBad());
    const picked = [...(data(u).niches ?? []), `custom:${t}`].slice(0, 2);
    await patch(u, {niches: picked, awaiting: null});
    await ctx.reply(T.chooseNiche(picked), html(K.niches(picked)));
  };

  // ---------- step 4: goal ----------
  bot.callbackQuery(/^g:(followers|views|creator_rewards|traffic)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    const goal = ctx.match[1] as Goal;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    await ctx.reply(`${GOALS[goal].emoji} <b>${GOALS[goal].label}</b>`, html());
    u = await patch(u, {goal});
    if (goal === 'creator_rewards') await ctx.reply(T.goalCreatorRewards());
    if (goal === 'traffic') {
      await patch(u, {awaiting: 'link_url'});
      return ctx.reply(T.askLink());
    }
    return advance(ctx, u, 'goal');
  });
  const onLink = async (ctx: Context, u: UserRow, text: string) => {
    let url: URL;
    try {
      url = new URL(text.trim());
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    } catch {
      return ctx.reply(T.linkBad());
    }
    u = await patch(u, {link_url: url.toString(), awaiting: null});
    return advance(ctx, u, 'goal');
  };

  // ---------- step 5: character ----------
  bot.callbackQuery('ch:yes', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await getOrCreate(ctx);
    await patch(u, {has_character: true, awaiting: 'description'});
    await ctx.reply(T.describeCharacter(), html());
  });
  bot.callbackQuery('ch:no', async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    u = await patch(u, {has_character: false, character_id: undefined, character_name: undefined, awaiting: null});
    await ctx.reply(T.noCharacter());
    await ctx.reply(T.makingVoices());
    const job = await startJob(ctx, u, 'voice_samples', {character: null});
    if (job) await patch(u, {pending_job: job.id});
  });
  bot.callbackQuery('ch:pip', async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    if (!isOwner(u)) return;
    const pip = await store.insertCharacter({user_id: u.id, name: 'Pip', description: PIP_BUILTIN, batch: 0, version: null, status: 'candidate', code: null});
    u = await patch(u, {has_character: true, character_id: pip.id, character_name: 'Pip', character_batch: 0, awaiting: null});
    await ctx.reply('🤖 Pip it is!');
    await ctx.reply(T.makingVoices());
    const job = await startJob(ctx, u, 'voice_samples', {character: pip.id});
    if (job) await patch(u, {pending_job: job.id});
  });
  bot.callbackQuery('ch:desc', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await getOrCreate(ctx);
    await patch(u, {awaiting: 'description'});
    await ctx.reply(T.describeCharacter(), html());
  });
  const drawCharacters = async (ctx: Context, u: UserRow) => {
    const d = data(u);
    const batch = (d.character_batch ?? Math.max(0, ...(await store.listCharacters(u.id)).map((c) => c.batch))) + 1;
    u = await patch(u, {character_batch: batch, awaiting: null});
    await ctx.reply(T.drawing());
    const job = await startJob(ctx, u, 'character_preview', {description: d.description, batch});
    if (job) await patch(u, {pending_job: job.id});
  };
  bot.callbackQuery('ch:more', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await getOrCreate(ctx);
    if (data(u).pending_job) return ctx.reply(T.stillWorking());
    await drawCharacters(ctx, u);
  });
  const onDescription = async (ctx: Context, u: UserRow, text: string) => {
    const desc = text.trim().replace(/\s+/g, ' ');
    if (desc.length < 5 || desc.length > 200) return ctx.reply(T.descriptionBad());
    const famous = famousCharacter(desc);
    if (famous) return ctx.reply(T.famous(famous), html());
    u = await patch(u, {description: desc});
    await drawCharacters(ctx, u);
  };
  bot.callbackQuery(/^ch:pick:([123])$/, async (ctx) => {
    let u = await getOrCreate(ctx);
    const d = data(u);
    const version = Number(ctx.match[1]);
    const chars = await store.listCharacters(u.id);
    const pick = chars.find((c) => c.batch === d.character_batch && c.version === version && c.status === 'candidate');
    if (!pick) return ctx.answerCallbackQuery({text: 'That version is not ready.', show_alert: true});
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    u = await patch(u, {character_id: pick.id, character_name: pick.name ?? 'your character'});
    await ctx.reply(`👍 Version ${version}: <b>${esc(pick.name ?? '')}</b>`, html());
    await sendVoices(ctx, u, pick.name);
  });

  const sendVoices = async (ctx: Context, u: UserRow, name: string | null) => {
    const d = data(u);
    const ids = d.voice_options ?? [];
    if (!ids.length) return ctx.reply(T.jobFailed('making voice samples'), html(K.retry('ch:voices')));
    await ctx.reply(T.pickVoice(name), html());
    for (const [i, id] of ids.entries()) {
      const path = `voices/${u.id}/${d.character_batch ?? 0}/${id}.ogg`;
      const url = await store.signedUrl(path, 3600);
      await ctx.replyWithVoice(url, {caption: `Voice ${i + 1}`}).catch(async () => ctx.reply(`Voice ${i + 1}: ${voiceName(id)}`));
    }
    await ctx.reply('Which voice?', html(K.voices(ids)));
  };
  bot.callbackQuery('ch:voices', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await getOrCreate(ctx);
    const job = await startJob(ctx, u, 'voice_samples', {character: data(u).character_id ?? null});
    if (job) await patch(u, {pending_job: job.id});
    await ctx.reply(T.makingVoices());
  });

  bot.callbackQuery(/^v:([a-z]{2}_[a-z]+)$/, async (ctx) => {
    let u = await getOrCreate(ctx);
    const d = data(u);
    const voice = ctx.match[1];
    if (!(d.voice_options ?? []).includes(voice)) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    // Lock: archive the old character (kept, never changed), lock the new one with its voice.
    const old = await store.getLockedCharacter(u.id);
    if (old) await store.updateCharacter(old.id, {status: 'archived'});
    let lockedId: string;
    if (d.has_character && d.character_id) {
      const c = await store.updateCharacter(d.character_id, {status: 'locked', voice_id: voice, locked_at: now().toISOString()});
      lockedId = c.id;
      await ctx.reply(T.characterLocked(c.name ?? 'Your character'), html());
    } else {
      const c = await store.insertCharacter({user_id: u.id, name: null, description: null, batch: 0, version: null, status: 'locked', code: null, voice_id: voice, locked_at: now().toISOString()});
      lockedId = c.id;
      await ctx.reply(T.voicePicked());
    }
    u = await patch(u, {voice_id: voice, character_id: lockedId});
    await advance(ctx, u, 'character');
  });

  // ---------- step 6: schedule and mode ----------
  bot.callbackQuery(/^tz:(\d+|type)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    if (ctx.match[1] === 'type') {
      await patch(u, {awaiting: 'timezone'});
      return ctx.reply(T.typeTimezone(), html());
    }
    const tz = COMMON_TIMEZONES[Number(ctx.match[1])]?.tz;
    if (!tz) return;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    await ctx.reply(`🕘 ${esc(tz)}`);
    u = await patch(u, {timezone: tz, awaiting: null});
    await advance(ctx, u, 'tz');
  });
  const onTimezone = async (ctx: Context, u: UserRow, text: string) => {
    const tz = parseTimezone(text);
    if (!tz) return ctx.reply(T.timezoneBad(), html());
    await ctx.reply(`🕘 ${esc(tz)}`);
    u = await patch(u, {timezone: tz, awaiting: null});
    await advance(ctx, u, 'tz');
  };
  bot.callbackQuery(/^ppd:([123])$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    const n = Number(ctx.match[1]);
    await ctx.reply(`${n} video${n > 1 ? 's' : ''} a day`);
    u = await patch(u, {posts_per_day: n});
    await advance(ctx, u, 'ppd');
  });
  bot.callbackQuery(/^tm:(ok|edit)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    const n = data(u).posts_per_day ?? 1;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    if (ctx.match[1] === 'edit') {
      await patch(u, {awaiting: 'times'});
      return ctx.reply(T.typeTimes(n), html());
    }
    u = await patch(u, {post_times: suggestTimes(n)});
    await advance(ctx, u, 'times');
  });
  const onTimes = async (ctx: Context, u: UserRow, text: string) => {
    const n = data(u).posts_per_day ?? 1;
    const times = parseTimes(text, n);
    if (!times) return ctx.reply(T.timesBad(n), html());
    await ctx.reply(`🕘 ${times.join(', ')}`);
    u = await patch(u, {post_times: times, awaiting: null});
    await advance(ctx, u, 'times');
  };
  bot.callbackQuery(/^m:(approval|auto)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    let mode = ctx.match[1] as 'approval' | 'auto';
    if (mode === 'auto' && !isOwner(u) && !deps.allowAutoForAll) {
      mode = 'approval';
      await ctx.reply(T.autoNotAllowed(), html());
    } else {
      await ctx.reply(mode === 'approval' ? '✋ Approval mode' : '⚡ Full auto');
    }
    u = await patch(u, {mode});
    await advance(ctx, u, 'mode');
  });

  // ---------- video theme (part of step 5) ----------
  const showTheme = async (ctx: Context, u: UserRow) => {
    const current = data(u).video_theme?.preset;
    const caption = T.askTheme();
    await ctx
      .replyWithPhoto(`${deps.baseUrl}/themes/presets.png`, {caption, parse_mode: 'HTML', ...kb(K.themes(current))})
      .catch(() => ctx.reply(caption, html(K.themes(current))));
  };
  bot.callbackQuery(/^th:([a-z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    const id = ctx.match[1];
    if (id === 'custom') {
      await patch(u, {awaiting: 'theme_colors'});
      return ctx.reply(T.typeTheme(), html());
    }
    if (!(id in PRESETS)) return;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    const choice: ThemeChoice = {preset: id as PresetId};
    await ctx.reply(T.themeSaved(themeLabel(choice)), html());
    u = await patch(u, {video_theme: choice, awaiting: null});
    await advance(ctx, u, 'theme');
  });
  const onThemeColors = async (ctx: Context, u: UserRow, text: string) => {
    const r = parseCustomTheme(text);
    if (!r.ok) return ctx.reply(T.themeBad(r.error), html());
    await ctx.reply(r.choice.preset === 'custom' ? T.themePicked(r.choice) : T.themeSaved(themeLabel(r.choice)), html());
    u = await patch(u, {video_theme: r.choice, awaiting: null});
    await advance(ctx, u, 'theme');
  };

  // ---------- summary ----------
  bot.callbackQuery('sum:edit', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('What do you want to change?', html(K.editPick()));
  });
  bot.callbackQuery(/^ed:(niche|goal|character|theme|schedule|mode|back)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    const what = ctx.match[1];
    if (what === 'back') return showSummary(ctx, u);
    u = await patch(u, {editing: what as OnboardingData['editing']});
    if (what === 'niche') return showNiche(ctx, u);
    if (what === 'goal') return showGoal(ctx);
    if (what === 'character') return showCharacter(ctx);
    if (what === 'theme') return showTheme(ctx, u);
    if (what === 'schedule') return showTimezone(ctx);
    return showMode(ctx);
  });
  bot.callbackQuery('sum:start', async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    if (onboarded(u)) return;
    const d = data(u);
    if (!d.niches?.length || !d.goal || !d.timezone || !d.post_times || !d.mode || !d.voice_id) return showStep(ctx, u);
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    await store.saveSettings(settingsFromData(u, null));
    u = await store.updateUser(u.id, {status: 'active', onboarding_step: 7, onboarding_data: {...d, awaiting: null, editing: null}});
    if (d.content_mode === 'marketing') return askForRefs(ctx, u);
    await ctx.reply(T.starting());
    await makeDryRun(ctx, u);
  });
  const makeDryRun = async (ctx: Context, u: UserRow) => {
    const locked = await store.getLockedCharacter(u.id);
    const v = await store.insertVideo({user_id: u.id, slot_at: now().toISOString(), is_dry_run: true, character_id: locked?.id ?? null, status: 'planned'});
    await startJob(ctx, u, 'dry_run', {}, v.id);
  };
  bot.callbackQuery('pv:ok', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    await ctx.reply(T.allSet(), html());
  });
  bot.callbackQuery('pv:again', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    await ctx.reply(T.starting());
    await makeDryRun(ctx, await getOrCreate(ctx));
  });

  const kickTick = () => (deps.tickNow ? deps.tickNow().catch((e) => console.warn('could not start a tick:', redact((e as Error).message))) : Promise.resolve());

  // ---------- approval ----------
  const ownVideo = async (ctx: Context, id: string) => {
    const v = await store.getVideo(id);
    return v && v.user_id === ctx.from!.id ? v : null;
  };
  bot.callbackQuery(/^ap:pv:([0-9a-f-]{36}):(\d)$/, async (ctx) => {
    const v = await ownVideo(ctx, ctx.match[1]);
    if (!v || v.status !== 'awaiting_approval') return ctx.answerCallbackQuery({text: 'This video is no longer waiting.'});
    const privacy = v.privacy_options?.[Number(ctx.match[2])];
    if (!privacy) return ctx.answerCallbackQuery();
    await store.updateVideo(v.id, {privacy});
    await ctx.answerCallbackQuery({text: 'OK'});
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: K.approval(v.id, v.privacy_options ?? [], privacy) as any}}).catch(() => undefined);
  });
  bot.callbackQuery(/^ap:(post|skip|regen):([0-9a-f-]{36})$/, async (ctx) => {
    const [, action, id] = ctx.match;
    const v = await ownVideo(ctx, id);
    if (!v || v.status !== 'awaiting_approval') return ctx.answerCallbackQuery({text: 'This video is no longer waiting.'});
    if (action === 'post') {
      if (!v.privacy) return ctx.answerCallbackQuery({text: T.pickPrivacyFirst(), show_alert: true});
      await ctx.answerCallbackQuery();
      await store.updateVideo(v.id, {status: 'approved'});
      await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
      const s = await store.getSettings(v.user_id);
      const slot = new Date(v.slot_at);
      if (slot.getTime() <= now().getTime() + 5 * 60000) await kickTick();
      return ctx.reply(T.approved(slot.getTime() <= now().getTime() + 5 * 60000 ? 'in the next few minutes' : `at ${fmtLocal(slot, s?.timezone ?? 'UTC')}`), html());
    }
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    if (action === 'skip') {
      await store.updateVideo(v.id, {status: 'skipped', video_path: null});
      if (v.video_path) await store.removeFiles([v.video_path]).catch(() => undefined);
      return ctx.reply(T.skipped());
    }
    const sameSlot = (await store.listVideos(v.user_id, {limit: 50})).filter((x) => x.slot_at === v.slot_at);
    if (sameSlot.length > 3) return ctx.reply(T.regenLimit());
    await store.updateVideo(v.id, {status: 'skipped'});
    const u = await getOrCreate(ctx);
    const fresh = await store.insertVideo({user_id: v.user_id, slot_at: v.slot_at, character_id: v.character_id, is_experiment: v.is_experiment, status: 'planned', ...(v.plan?.marketing ? {plan: {marketing: v.plan.marketing}} : {})});
    await ctx.reply(T.regenerating());
    await startJob(ctx, u, 'render', {regenerate: true}, fresh.id);
  });
  bot.callbackQuery(/^retry:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const v = await ownVideo(ctx, ctx.match[1]);
    if (!v || !['failed'].includes(v.status)) return;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    const u = await getOrCreate(ctx);
    if (v.video_path && v.plan) {
      // Rendered fine, posting failed: try posting again.
      await store.updateVideo(v.id, {status: 'approved', error: null});
      await kickTick();
      return ctx.reply(T.approved('in the next few minutes'), html());
    }
    await store.updateVideo(v.id, {status: 'planned', error: null});
    await ctx.reply(T.regenerating());
    await startJob(ctx, u, v.is_dry_run ? 'dry_run' : 'render', {retry: true}, v.id);
  });
  bot.callbackQuery(/^rj:([0-9a-f-]{36})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const job = await store.getJob(ctx.match[1]);
    if (!job || job.user_id !== ctx.from!.id || job.status !== 'failed') return;
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    const u = await getOrCreate(ctx);
    const again = await startJob(ctx, u, job.kind, job.input, job.video_id ?? undefined);
    if (again && ['character_preview', 'voice_samples'].includes(job.kind)) await patch(u, {pending_job: again.id});
    await ctx.reply(T.stillWorking());
  });

  // ---------- commands ----------
  const requireReady = async (ctx: Context) => {
    const u = await store.getUser(ctx.from!.id);
    if (!u || !onboarded(u)) {
      await ctx.reply(T.notReady());
      return null;
    }
    return u;
  };

  bot.command('help', (ctx) => ctx.reply(T.help(), html(K.backHome())));

  const statsCmd = async (ctx: Context) => {
    const u = await requireReady(ctx);
    if (!u) return;
    const a = await loadAnalytics(store, u.id);
    if (!a.account.length) return ctx.reply(T.noData());
    const d = buildDashboard(a, 30, now());
    const today = d.series.at(-1)!;
    const tz = a.tz;
    const todayKey = today.day;
    const videosToday = a.posted.filter((v) => {
      const p = localParts(new Date(v.posted_at ?? v.slot_at), tz);
      return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` === todayKey;
    }).length;
    const text = T.stats({
      followers: d.account.followers,
      dFollowers: d.kpis.growth.followers.day,
      views: today.views,
      likes: today.likes,
      engagement: today.engagement,
      videosToday,
      tooSmall: a.posted.length < MIN_VIDEOS_FOR_PATTERNS,
    });
    try {
      // Start the chart where the data starts (at least 7 days), so a new account has no fake jump from 0.
      const first = d.series.findIndex((s) => s.followers !== null);
      const shown = d.series.slice(Math.max(0, Math.min(first < 0 ? 0 : first, d.series.length - 7)));
      const png = await (deps.statsChart ?? (await import('../lib/charts.js')).statsChartPng)({
        labels: shown.map((s) => s.day.slice(5)),
        followers: shown.map((s) => s.followers),
        views: shown.map((s) => s.views),
        title: `@${a.tiktok?.username ?? ''} · last ${shown.length} days`,
      });
      await ctx.replyWithPhoto(new InputFile(png, 'stats.png'), {caption: text, parse_mode: 'HTML'});
    } catch {
      await ctx.reply(text, html());
    }
  };
  bot.command('stats', statsCmd);

  const topCmd = async (ctx: Context) => {
    const u = await requireReady(ctx);
    if (!u) return;
    const a = await loadAnalytics(store, u.id);
    const stats = videoStats(a);
    if (!stats.length) return ctx.reply(T.noData());
    const line = (s: (typeof stats)[number], i: number, by: 'views' | 'eng') =>
      `${i + 1}. ${s.shareUrl ? `<a href="${esc(s.shareUrl)}">${esc(s.topic || cut(s.caption, 40))}</a>` : esc(s.topic || cut(s.caption, 40))}${s.viral ? ' 🔥' : ''}\n    ${by === 'views' ? `${fmtNum(s.views)} views · ${fmtPct(s.engagement)}` : `${fmtPct(s.engagement)} engagement · ${fmtNum(s.views)} views`}`;
    const byViews = [...stats].sort((x, y) => y.views - x.views).slice(0, 5);
    const byEng = [...stats].filter((s) => s.views >= 50).sort((x, y) => y.engagement - x.engagement).slice(0, 5);
    await ctx.reply(
      `🏆 <b>Top 5 by views</b>\n${byViews.map((s, i) => line(s, i, 'views')).join('\n')}\n\n💬 <b>Top 5 by engagement</b>\n${byEng.length ? byEng.map((s, i) => line(s, i, 'eng')).join('\n') : '<i>Needs videos with 50+ views.</i>'}${stats.length < MIN_VIDEOS_FOR_PATTERNS ? `\n\n<i>Only ${stats.length} videos so far, so this list will change a lot.</i>` : ''}`,
      html(),
    );
  };
  bot.command('top', topCmd);

  const reportCmd = async (ctx: Context) => {
    const u = await requireReady(ctx);
    if (!u) return;
    const a = await loadAnalytics(store, u.id);
    const p = a.pattern;
    const n = a.posted.length;
    if (!p) {
      return ctx.reply(
        `📝 <b>Weekly report</b>\nThe first report comes after your first full week.${n < MIN_VIDEOS_FOR_PATTERNS ? `\n\nYou have ${n} video${n === 1 ? '' : 's'}. With fewer than 15, the data is too small to say what works.` : ''}`,
        html(),
      );
    }
    const good = (p.items as any[]).filter((i) => i.lift >= 1.2).slice(0, 4);
    const bad = (p.items as any[]).filter((i) => i.lift <= 0.8).slice(0, 3);
    await ctx.reply(
      `📝 <b>Weekly report</b> (week of ${esc(p.week_start)}, ${p.sample_size} videos)\n${p.too_small ? '\n⚠️ <i>Fewer than 15 videos: the data is too small, so these are early guesses, not rules.</i>\n' : ''}\n${p.summary ? `${esc(p.summary)}\n` : ''}\n✅ <b>What worked</b>\n${good.length ? good.map((i) => `• ${esc(i.text)} (${i.n} videos)`).join('\n') : '• Nothing clear yet'}\n\n❌ <b>What didn't</b>\n${bad.length ? bad.map((i) => `• ${esc(i.text)} (${i.n} videos)`).join('\n') : '• Nothing clear yet'}\n\n🔧 <b>What I'll change</b>\n${(p.changes ?? []).length ? p.changes.map((c) => `• ${esc(c)}`).join('\n') : '• Keep the current mix'}\n• 1 in 5 videos stays an experiment so I keep learning`,
      html(),
    );
  };
  bot.command('report', reportCmd);

  bot.command('dashboard', async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return;
    await ctx.reply(T.dashboard(), html(K.dashboard(`${deps.baseUrl}/app/`)));
  });

  // ---------- my videos and posting mode ----------
  const VIDEOS_PER_PAGE = 6;
  const currentMode = async (u: UserRow) => (await store.getSettings(u.id))?.mode ?? data(u).mode ?? 'approval';

  const videosView = async (u: UserRow, page: number) => {
    const s = await store.getSettings(u.id);
    const tz = s?.timezone ?? 'UTC';
    const mode = s?.mode ?? 'approval';
    // Every video made, posted or not (test videos too). Slots that were never made are left out.
    const all = (await store.listVideos(u.id, {limit: 120, includeDryRun: true})).filter((v) => v.status !== 'planned' || v.video_path);
    if (!all.length) return {text: T.noVideos(mode), keyboard: K.modeSwitch(mode)};
    const pages = Math.ceil(all.length / VIDEOS_PER_PAGE);
    const p = Math.min(Math.max(0, page), pages - 1);
    const items = all.slice(p * VIDEOS_PER_PAGE, (p + 1) * VIDEOS_PER_PAGE).map((v) => {
      const title = videoTitle(v);
      return {id: v.id, label: `${v.is_dry_run ? '🧪' : STATUS_ICON[v.status] ?? '🎬'} ${shortDay(new Date(v.is_dry_run ? v.created_at : v.slot_at), tz)} · ${[...title].length > 34 ? `${cut(title, 33)}…` : title}`};
    });
    return {text: T.videosList(all.length, mode, p, pages), keyboard: K.videos(items, p, pages, mode, `${deps.baseUrl}/app/`)};
  };

  const sendVideosView = async (ctx: Context, u: UserRow, page: number, edit: boolean) => {
    const view = await videosView(u, page);
    if (edit) {
      const ok = await ctx
        .editMessageText(view.text, html(view.keyboard))
        .then(() => true)
        .catch((e) => String(e).includes('not modified'));
      if (ok) return;
    }
    await ctx.reply(view.text, html(view.keyboard));
  };

  bot.command('videos', async (ctx) => {
    const u = await requireReady(ctx);
    if (u) await sendVideosView(ctx, u, 0, false);
  });
  bot.callbackQuery(/^vd:list:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await requireReady(ctx);
    if (u) await sendVideosView(ctx, u, Number(ctx.match[1]), ctx.callbackQuery.message?.text !== undefined);
  });

  bot.callbackQuery(/^vd:show:([0-9a-f-]{36})$/, async (ctx) => {
    const v = await ownVideo(ctx, ctx.match[1]);
    if (!v) return ctx.answerCallbackQuery({text: 'That video is gone.'});
    await ctx.answerCallbackQuery();
    await sendVideoCard(ctx.api, ctx.chat?.id ?? ctx.from.id, store, v);
  });

  const setMode = async (ctx: Context, u: UserRow, want: 'approval' | 'auto') => {
    if (want === 'auto' && !isOwner(u) && !deps.allowAutoForAll) {
      await ctx.answerCallbackQuery({text: 'Full auto is not available yet: TikTok needs each post approved until it reviews this app.', show_alert: true});
      return false;
    }
    const s = await store.getSettings(u.id);
    if (s) await store.saveSettings({...s, mode: want});
    await patch(u, {mode: want});
    const waiting = want === 'auto' ? (await store.listVideos(u.id, {status: ['awaiting_approval']})).length : 0;
    await ctx.answerCallbackQuery({text: want === 'auto' ? '⚡ Full auto is on' : '✋ Review and approve is on'});
    await ctx.reply(T.modeSwitched(want, waiting), html());
    return true;
  };

  bot.command('mode', async (ctx) => {
    const u = await requireReady(ctx);
    if (u) await ctx.reply(T.modeNow(await currentMode(u)), html(K.modeSwitch(await currentMode(u))));
  });
  bot.callbackQuery('md:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await requireReady(ctx);
    if (u) await ctx.reply(T.modeNow(await currentMode(u)), html(K.modeSwitch(await currentMode(u))));
  });
  bot.callbackQuery(/^md:(approval|auto)(?::(\d+))?$/, async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return ctx.answerCallbackQuery();
    const want = ctx.match[1] as 'approval' | 'auto';
    if ((await currentMode(u)) === want) return ctx.answerCallbackQuery({text: want === 'auto' ? 'Full auto is already on.' : 'Review and approve is already on.'});
    if (!(await setMode(ctx, u, want))) return;
    const fresh = (await store.getUser(u.id))!;
    // Refresh the message the switch was on, so its buttons show the new mode.
    if (ctx.match[2] !== undefined) {
      const view = await videosView(fresh, Number(ctx.match[2]));
      await ctx.editMessageText(view.text, html(view.keyboard)).catch(() => undefined);
    } else {
      await ctx.editMessageText(T.modeNow(want), html(K.modeSwitch(want))).catch(() => undefined);
    }
  });

  // ---------- home menu ----------
  const showHome = async (ctx: Context, u: UserRow) => {
    const s = await store.getSettings(u.id);
    const tt = await store.getTikTok(u.id);
    const mode = s?.mode ?? data(u).mode ?? 'approval';
    const paused = u.status !== 'active';
    const next = !paused && s ? slotsBetween(s.post_times, s.timezone, now(), new Date(now().getTime() + 2 * 86400000)).find((d) => d > now()) : undefined;
    const text = T.home({
      username: tt?.username ?? null,
      mode,
      paused,
      next: next && s ? fmtLocal(next, s.timezone) : null,
      marketing: data(u).content_mode === 'marketing',
    });
    await ctx.reply(text, html(K.home(mode, paused, `${deps.baseUrl}/app/`)));
  };
  bot.callbackQuery(/^hm:(home|stats|top|report|settings|help|pause|resume)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const u = await requireReady(ctx);
    if (!u) return;
    const what = ctx.match[1];
    if (what === 'home') return showHome(ctx, u);
    if (what === 'stats') return statsCmd(ctx);
    if (what === 'top') return topCmd(ctx);
    if (what === 'report') return reportCmd(ctx);
    if (what === 'settings') return ctx.reply(T.settingsMenu(), html(K.settings()));
    if (what === 'help') return ctx.reply(T.help(), html(K.backHome()));
    if (what === 'pause') {
      await store.updateUser(u.id, {status: 'paused'});
      return ctx.reply(T.paused(), html(K.backHome()));
    }
    if (u.status === 'paused_quota') return ctx.reply(T.pausedQuota());
    await store.updateUser(u.id, {status: 'active'});
    return ctx.reply(T.resumed(), html(K.backHome()));
  });
  bot.command('menu', async (ctx) => {
    const u = await requireReady(ctx);
    if (u) await showHome(ctx, u);
  });

  bot.command('settings', async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return;
    await ctx.reply(T.settingsMenu(), html(K.settings()));
  });
  bot.callbackQuery(/^st:(niche|goal|schedule|mode|ppd|theme|newchar|newchar:yes|cancel)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await requireReady(ctx);
    if (!u) return;
    const what = ctx.match[1];
    if (what === 'cancel') return ctx.reply(T.settingsMenu(), html(K.settings()));
    if (what === 'newchar') return ctx.reply(T.newCharacterWarn(), html(K.confirmNewCharacter()));
    const s = await store.getSettings(u.id);
    // Start from the saved settings so only the edited part changes.
    const base: Partial<OnboardingData> = s
      ? {niches: s.niches, goal: s.goal, link_url: s.link_url ?? undefined, timezone: s.timezone, posts_per_day: s.posts_per_day, post_times: s.post_times, mode: s.mode}
      : {};
    const editing = what === 'newchar:yes' ? 'character' : what === 'ppd' ? 'schedule' : (what as OnboardingData['editing']);
    u = await patch(u, {...base, editing});
    if (what === 'niche') return showNiche(ctx, u);
    if (what === 'goal') return showGoal(ctx);
    if (what === 'schedule') return showTimezone(ctx);
    if (what === 'ppd') return showPpd(ctx);
    if (what === 'mode') return showMode(ctx);
    if (what === 'theme') return showTheme(ctx, u);
    return showCharacter(ctx);
  });

  bot.command('pause', async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return;
    await store.updateUser(u.id, {status: 'paused'});
    await ctx.reply(T.paused());
  });
  bot.command('resume', async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return;
    if (u.status === 'paused_quota') return ctx.reply(T.pausedQuota());
    await store.updateUser(u.id, {status: 'active'});
    await ctx.reply(T.resumed());
  });

  bot.command('disconnect', async (ctx) => {
    const u = await store.getUser(ctx.from!.id);
    if (!u) return ctx.reply(T.notReady());
    await ctx.reply(T.disconnectAsk(), html(K.disconnect()));
  });
  bot.callbackQuery(/^dc:(yes|no)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
    if (ctx.match[1] === 'no') return ctx.reply('👍 Nothing changed.');
    const uid = ctx.from!.id;
    await deps.revokeTikTok?.(uid).catch(() => undefined);
    for (const prefix of ['previews', 'voices', 'videos', 'thumbs', 'charts', 'work']) {
      const files = await store.listFiles(`${prefix}/${uid}`).catch(() => [] as string[]);
      await store.removeFiles(files).catch(() => undefined);
    }
    await store.deleteUserData(uid);
    await ctx.reply(T.disconnected());
  });

  // ---------- marketing videos ----------
  const postTimes = async (u: UserRow) => (await store.getSettings(u.id))?.post_times ?? data(u).post_times ?? suggestTimes(3);
  const tzOf = async (u: UserRow) => (await store.getSettings(u.id))?.timezone ?? data(u).timezone ?? 'UTC';
  const tomorrow = async (u: UserRow) => nextDay(localDay(now(), await tzOf(u)));

  const askForRefs = async (ctx: Context, u: UserRow) => {
    u = await patch(u, {awaiting: 'ref_videos', ref_draft: []});
    await ctx.reply(T.askRefs(dayLabel(await tomorrow(u)), await postTimes(u)), html());
  };
  const showBusiness = async (ctx: Context, u: UserRow) => {
    await patch(u, {content_mode: 'marketing', awaiting: 'business_info', editing: onboarded(u) ? 'business' : data(u).editing ?? null});
    await ctx.reply(T.askBusiness(), html());
  };
  const onBusiness = async (ctx: Context, u: UserRow, text: string) => {
    const t = text.trim().replace(/\s+/g, ' ').slice(0, 1200);
    if (t.length < 20) return ctx.reply(T.businessTooShort());
    const d = data(u);
    const link = linkFrom(t);
    u = await patch(u, {
      business: t,
      content_mode: 'marketing',
      awaiting: null,
      link_url: link ?? undefined,
      goal: link ? 'traffic' : 'followers',
      niches: d.niches?.length ? d.niches : ['custom:Marketing'],
    });
    await ctx.reply(T.businessSaved(link), html());
    if (!onboarded(u)) return advance(ctx, u, 'goal');
    // Already set up: switch to 3 posts a day and ask for the first references.
    const cur = await store.getSettings(u.id);
    const times = cur && cur.post_times.length === 3 ? cur.post_times : suggestTimes(3);
    u = await patch(u, {editing: null, posts_per_day: 3, post_times: times});
    await store.saveSettings({...settingsFromData(u, cur), posts_per_day: 3, post_times: times, goal: link ? 'traffic' : cur?.goal ?? 'followers', link_url: link ?? cur?.link_url ?? null});
    if (!(data(u).marketing_briefs ?? []).length) return askForRefs(ctx, u);
    return ctx.reply(T.saved(), html(K.marketingMenu()));
  };
  const saveBrief = async (ctx: Context, u: UserRow, notes: string) => {
    const d = data(u);
    const refs = d.ref_draft ?? [];
    if (refs.length < REFS_PER_DAY) return askForRefs(ctx, u);
    const day = await tomorrow(u);
    const briefs = addBrief(d.marketing_briefs, {day, refs: refs.slice(0, REFS_PER_DAY), notes: notes.trim().slice(0, 800), created_at: now().toISOString()});
    const first = !(d.marketing_briefs ?? []).length;
    u = await patch(u, {marketing_briefs: briefs, ref_draft: [], awaiting: null});
    await ctx.reply(T.briefSaved(dayLabel(day), await postTimes(u)), html());
    if (first) {
      await ctx.reply(T.allSet(), html());
      await ctx.reply(T.dashboard(), html(K.dashboard(`${deps.baseUrl}/app/`)));
    }
  };
  const onRefVideo = async (ctx: Context, media: {file_id: string; duration?: number; width?: number; height?: number; file_size?: number; mime_type?: string; file_name?: string}) => {
    let u = await getOrCreate(ctx);
    const d = data(u);
    if (!onboarded(u)) return showStep(ctx, u);
    if (d.content_mode !== 'marketing') return ctx.reply(T.notMarketing(), html());
    const check = checkRef(media);
    if (!check.ok) return ctx.reply(T.refBad(check.why));
    // A video sent any time starts a new set of references.
    const draft = d.awaiting === 'ref_videos' ? [...(d.ref_draft ?? [])] : [];
    if (draft.some((r) => r.file_id === check.ref.file_id)) return ctx.reply(T.refDuplicate());
    draft.push(check.ref);
    if (draft.length < REFS_PER_DAY) {
      await patch(u, {awaiting: 'ref_videos', ref_draft: draft});
      return ctx.reply(T.refGot(draft.length));
    }
    u = await patch(u, {awaiting: 'ref_notes', ref_draft: draft.slice(0, REFS_PER_DAY)});
    await ctx.reply(T.refGot(REFS_PER_DAY));
    await ctx.reply(T.askNotes(), html(K.refNotes()));
  };
  bot.on('message:video', (ctx) => onRefVideo(ctx, ctx.message.video));
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    if (!doc.mime_type?.startsWith('video/')) return ctx.reply(T.refBad('not_video'));
    return onRefVideo(ctx, {...doc, duration: 0});
  });
  bot.on('message:animation', (ctx) => onRefVideo(ctx, ctx.message.animation));

  bot.command('marketing', async (ctx) => {
    const u = await requireReady(ctx);
    if (!u) return;
    if (data(u).content_mode !== 'marketing' || !data(u).business) return showBusiness(ctx, u);
    const last = (data(u).marketing_briefs ?? []).at(-1);
    await ctx.reply(T.marketingMenu(data(u).business!, last ? dayLabel(last.day) : null), html(K.marketingMenu()));
  });
  bot.callbackQuery(/^mk:(on|menu|business|refs|same|nonotes|off)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    let u = await getOrCreate(ctx);
    const d = data(u);
    const what = ctx.match[1];
    if (what === 'on' || what === 'business') {
      await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
      return showBusiness(ctx, u);
    }
    if (!onboarded(u)) return showStep(ctx, u);
    if (what === 'menu') {
      if (d.content_mode !== 'marketing' || !d.business) return showBusiness(ctx, u);
      const last = (d.marketing_briefs ?? []).at(-1);
      return ctx.reply(T.marketingMenu(d.business, last ? dayLabel(last.day) : null), html(K.marketingMenu()));
    }
    if (d.content_mode !== 'marketing') return ctx.reply(T.notMarketing(), html());
    if (what === 'refs') return askForRefs(ctx, u);
    if (what === 'nonotes') {
      await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
      if (d.awaiting !== 'ref_notes') return;
      return saveBrief(ctx, u, '');
    }
    if (what === 'same') {
      const last = (d.marketing_briefs ?? []).at(-1);
      if (!last) return askForRefs(ctx, u);
      const day = await tomorrow(u);
      await ctx.editMessageReplyMarkup({reply_markup: {inline_keyboard: []}}).catch(() => undefined);
      u = await patch(u, {marketing_briefs: addBrief(d.marketing_briefs, {...last, day, created_at: now().toISOString()})});
      return ctx.reply(T.reusedRefs(dayLabel(day)));
    }
    // off: back to explainer videos, pick niches again.
    const s = await store.getSettings(u.id);
    u = await patch(u, {content_mode: 'explainer', awaiting: null, niches: (d.niches ?? []).filter((n) => n !== 'custom:Marketing'), editing: 'niche', ...(s ? {timezone: s.timezone, posts_per_day: s.posts_per_day, post_times: s.post_times, mode: s.mode, goal: s.goal} : {})});
    await ctx.reply(T.marketingOff());
    return showNiche(ctx, u);
  });

  // ---------- typed text ----------
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return ctx.reply(T.unknownCommand(), html(K.backHome()));
    const u = await getOrCreate(ctx);
    const text = ctx.message.text;
    // Anything that looks like a secret is deleted even if we didn't ask for it.
    if (/sk-ant-|\b(act|rft)\.[A-Za-z0-9._-]{10,}/.test(text) && data(u).awaiting !== 'claude_secret') {
      await ctx.deleteMessage().catch(() => undefined);
      return ctx.reply('🔒 That looked like a secret, so I deleted it. Use /start to continue setup.');
    }
    switch (data(u).awaiting) {
      case 'claude_secret':
        return onClaudeSecret(ctx, u, text);
      case 'custom_niche':
        return onCustomNiche(ctx, u, text);
      case 'link_url':
        return onLink(ctx, u, text);
      case 'description':
        return onDescription(ctx, u, text);
      case 'timezone':
        return onTimezone(ctx, u, text);
      case 'times':
        return onTimes(ctx, u, text);
      case 'theme_colors':
        return onThemeColors(ctx, u, text);
      case 'business_info':
        return onBusiness(ctx, u, text);
      case 'ref_videos':
        return ctx.reply(/tiktok\.com|instagram\.com|youtu/i.test(text) ? T.refLink() : T.refNeedVideo((data(u).ref_draft ?? []).length), html());
      case 'ref_notes':
        return saveBrief(ctx, u, text);
    }
    if (!onboarded(u)) return showStep(ctx, u);
    return showHome(ctx, u);
  });

  // Log only the redacted message (the grammY error object carries the bot token), tell the user,
  // and answer Telegram with 200 so it does not retry the same update in a loop.
  bot.catch(async (err) => {
    const cause = err.error instanceof Error ? err.error.message : String(err.error);
    console.error(`Bot error on update ${err.ctx.update.update_id}: ${redact(cause)}`);
    await err.ctx.reply('Sorry, something went wrong on my side. Please try again in a minute.').catch(() => undefined);
  });

  return bot;
}

export const voiceName = (id: string) => {
  const names: Record<string, string> = {
    af_heart: 'Heart (warm, US)', af_bella: 'Bella (bright, US)', af_nicole: 'Nicole (soft, US)', af_sky: 'Sky (light, US)', af_nova: 'Nova (clear, US)',
    am_adam: 'Adam (deep, US)', am_michael: 'Michael (calm, US)', am_puck: 'Puck (playful, US)', am_fenrir: 'Fenrir (bold, US)', am_echo: 'Echo (even, US)',
    bf_emma: 'Emma (UK)', bf_isabella: 'Isabella (UK)', bm_george: 'George (UK)', bm_lewis: 'Lewis (UK)', bm_fable: 'Fable (UK)',
  };
  return names[id] ?? id;
};

/** Description stored for the owner's built-in Pip (rendered with the "pip" registry key). */
export const PIP_BUILTIN = 'Pip (built in)';

export const KOKORO_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sky', 'af_nova', 'am_adam', 'am_michael', 'am_puck', 'am_fenrir', 'am_echo', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis', 'bm_fable'];

/** Called by /api/tiktok/callback after a successful login. */
export async function onTikTokConnected(api: Api, store: Store, userId: number, me: TikTokUser) {
  const u = await store.getUser(userId);
  if (!u) return;
  const text = T.tiktokConnected(me.username ?? me.display_name ?? '?', me.follower_count ?? 0, me.likes_count ?? 0, me.video_count ?? 0);
  const firstTime = u.onboarding_step === 1;
  if (firstTime) await store.updateUser(userId, {onboarding_step: 2});
  const markup = firstTime ? {reply_markup: {inline_keyboard: K.next() as any}} : {};
  try {
    if (!me.avatar_url) throw new Error('no avatar');
    await api.sendPhoto(userId, me.avatar_url, {caption: text, parse_mode: 'HTML', ...markup});
  } catch {
    await api.sendMessage(userId, text, {parse_mode: 'HTML', ...markup});
  }
}

export const nextSlotText = (s: SettingsRow, from: Date) => {
  const next = slotsBetween(s.post_times, s.timezone, from, new Date(from.getTime() + 3 * 86400000))[0];
  return next ? fmtLocal(next, s.timezone) : s.post_times[0];
};

export const newId = () => crypto.randomUUID();
