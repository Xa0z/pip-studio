/**
 * Job phases. A GitHub Actions job runs: prepare (has secrets) -> render (NO secrets) -> finish (has secrets).
 * Render only reads files written by prepare, so code Claude wrote from a user's text never runs
 * in a process that can see a token.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {ClaudeCredential} from '../../src/plan.js';
import {countWords} from '../../src/schema.js';
import type {TimedScene, VideoProps, Word} from '../../src/schema.js';
import {buildTimeline, FPS, lengthSpec, validateTimeline, voiceProblems} from '../../src/timeline.js';
import {synthesize, type VoiceResult} from '../../src/voice.js';
import {choosePrivacy} from '../../src/publish.js';
import {creatorInfo} from '../../src/tiktok.js';
import {K} from '../bot/keyboards.js';
import {nextSlotText, PIP_BUILTIN} from '../bot/bot.js';
import {esc, T} from '../bot/texts.js';
import {loadAnalytics, videoStats} from '../lib/analytics.js';
import {aadFor, decryptSecret} from '../lib/crypto.js';
import {ctaLabel, GOALS, goalScore, pickLength} from '../lib/goals.js';
import {isThemeChoice, resolveTheme} from '../../src/themes.js';
import {nextNiche, nicheById} from '../lib/niches.js';
import {findPatterns, isExperiment, plannerHints} from '../lib/patterns.js';
import {sceneRange, type StudioPlan} from '../lib/plan-schema.js';
import {addSecret, redact} from '../lib/redact.js';
import {fmtLocal, localParts} from '../lib/schedule.js';
import {signState} from '../lib/state.js';
import {accessTokenFor, authorizeUrl, TikTokReconnectNeeded} from '../lib/tiktok.js';
import type {CharacterRow, JobRow, SettingsRow, UserRow, VideoRow} from '../lib/types.js';
import {CharacterRefused, designCharacters, registryKey, sha256, writeRegistry} from './characters.js';
import type {WorkerCtx} from './context.js';
import {makeVoiceSamples} from './voices.js';

// ---------- state passed between phases ----------
type VideoState = {
  kind: 'video';
  videoId: string;
  props: Omit<VideoProps, 'voiceFile' | 'musicFile'>;
  voicePath: string;
  seconds: number;
  outPath?: string;
  thumbPath?: string;
};
type CharacterState = {kind: 'character'; batch: number; description: string; drafts: {name: string; code: string; key: string; png?: string; error?: string}[]; voices: {voice: string; file: string}[]};
type State = VideoState | CharacterState | {kind: 'none'};

const dirFor = (ctx: WorkerCtx, job: JobRow) => path.join(ctx.workDir, job.id);
const statePath = (ctx: WorkerCtx, job: JobRow) => path.join(dirFor(ctx, job), 'state.json');
const saveState = (ctx: WorkerCtx, job: JobRow, s: State) => {
  fs.mkdirSync(dirFor(ctx, job), {recursive: true});
  fs.writeFileSync(statePath(ctx, job), JSON.stringify(s));
};
export const loadState = (ctx: WorkerCtx, job: JobRow): State => (fs.existsSync(statePath(ctx, job)) ? JSON.parse(fs.readFileSync(statePath(ctx, job), 'utf8')) : {kind: 'none'});

export async function credentialFor(ctx: WorkerCtx, userId: number): Promise<ClaudeCredential> {
  const row = await ctx.store.getClaude(userId);
  if (!row) throw new Error('Claude is not connected. Use /settings or /start to connect it.');
  const secret = decryptSecret(row.secret_enc, aadFor.claude(userId));
  addSecret(secret);
  return {kind: row.kind, secret};
}

/** Which registry key renders this character (null = no character). */
export const characterKey = (c: CharacterRow | null): string | null => {
  if (!c) return null;
  if (c.code) return registryKey(c.id);
  if (c.description === PIP_BUILTIN) return 'pip';
  return null;
};

const hookLine = (p: StudioPlan) => p.scenes[0]?.narration ?? '';

export function captionFor(plan: StudioPlan) {
  return `${plan.caption}\n\n${plan.hashtags.join(' ')}`.slice(0, 2200);
}

export function featuresFor(plan: StudioPlan, slot: Date, tz: string, seconds: number, cta: string, nicheId: string) {
  const p = localParts(slot, tz);
  return {
    niche: nicheId,
    topic: plan.topic,
    category: plan.category.toLowerCase(),
    hook_text: hookLine(plan),
    hook_type: plan.hookType,
    layouts: plan.scenes.map((s) => s.visual?.layout).filter(Boolean) as string[],
    length_s: seconds,
    local_hour: p.hour,
    weekday: p.weekday,
    caption_style: plan.captionStyle,
    hashtags: plan.hashtags,
    cta_type: cta,
  };
}

// ---------- prepare ----------
export async function prepare(ctx: WorkerCtx, jobId: string) {
  const job = await ctx.store.getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  // The tick may have given up on a job whose runner started very late: don't make it twice.
  if (job.status === 'done' || job.status === 'failed') throw new Error(`job ${jobId} is already ${job.status}`);
  await ctx.store.updateJob(job.id, {status: 'running', started_at: ctx.now().toISOString(), attempts: job.attempts + 1});
  switch (job.kind) {
    case 'render':
    case 'dry_run':
      return prepareVideo(ctx, job);
    case 'character_preview':
      return prepareCharacters(ctx, job);
    case 'voice_samples':
      return voiceSamplesJob(ctx, job);
    case 'claude_check':
      return claudeCheckJob(ctx, job);
    case 'weekly_analysis':
      return weeklyJob(ctx, job);
    default:
      saveState(ctx, job, {kind: 'none'});
  }
}

async function prepareVideo(ctx: WorkerCtx, job: JobRow) {
  const {store} = ctx;
  const v = await store.getVideo(job.video_id!);
  if (!v) throw new Error('video not found');
  const u = (await store.getUser(v.user_id))!;
  const s = await store.getSettings(u.id);
  if (!s) throw new Error('settings missing');
  const character = v.character_id ? await store.getCharacter(v.character_id) : await store.getLockedCharacter(u.id);
  const cred = await credentialFor(ctx, u.id);
  const ask = ctx.ask(cred);

  const all = await store.listVideos(u.id, {includeDryRun: true, limit: 500});
  const real = all.filter((x) => !x.is_dry_run && ['posted', 'approved', 'awaiting_approval', 'publishing'].includes(x.status));
  const index = real.length;
  const pastTopics = all.map((x) => x.plan?.topic).filter(Boolean).reverse() as string[];
  const niche = nextNiche(s.niches, real.map((x) => x.features?.niche ?? '').filter(Boolean).reverse());
  const seconds = pickLength(s.goal, index + Math.floor(ctx.now().getTime() / 86400000));
  const experiment = !v.is_dry_run && (v.is_experiment || isExperiment(index));
  const pattern = await store.latestPattern(u.id);
  const hints = pattern ? plannerHints(pattern.items as any, pattern.too_small) : [];
  const cta = GOALS[s.goal].cta;
  const name = character?.name ?? null;

  await store.updateVideo(v.id, {status: 'rendering', is_experiment: experiment, attempts: v.attempts + 1});
  const {writePlan, revise} = await import('./planner.js');
  const pctx = {niche, goal: s.goal, seconds, cta, characterName: name, linkUrl: s.link_url, pastTopics, hints, experiment, recentHookTypes: real.slice(0, 5).map((x) => x.features?.hook_type ?? '').filter(Boolean)};
  let plan = await writePlan(pctx, ask);

  // Fit the voice: Kokoro speed first (0.9 to 1.1), then rewrites (max 4).
  const spec = lengthSpec(seconds);
  const dir = dirFor(ctx, job);
  fs.mkdirSync(dir, {recursive: true});
  const voiceId = character?.voice_id ?? 'af_heart';
  let speed = 1.0;
  let rewrites = 0;
  let voice: VoiceResult | null = null;
  for (let round = 1; round <= 12; round++) {
    const vr = await synthesize(plan, dir, speed, voiceId, (spec.speechMin + spec.speechMax) / 2);
    const problems = voiceProblems(plan, vr, spec);
    if (!problems.length) {
      voice = vr;
      break;
    }
    const target = (spec.speechMin + spec.speechMax) / 2;
    const clamped = Math.min(1.1, Math.max(0.9, (speed * vr.speechEnd) / target));
    const lengthOnly = problems.every((p) => p.startsWith('spoken length'));
    if (lengthOnly && Math.abs(clamped - speed) > 0.004 && (vr.speechEnd * speed) / clamped >= spec.speechMin - 0.5) {
      speed = clamped;
      continue;
    }
    if (rewrites >= 4) throw new Error(`Voice still does not fit after 4 rewrites: ${problems.join('; ')}`);
    rewrites++;
    const wps = plan.scenes.reduce((n, sc) => n + countWords(sc.narration), 0) / vr.speechEnd;
    const diff = Math.round((target - vr.speechEnd) * wps);
    plan = await revise(plan, pctx, lengthOnly ? [...problems, `${diff > 0 ? 'add' : 'remove'} about ${Math.abs(diff)} words in total`] : problems, ask);
    speed = 1.0;
  }
  if (!voice) throw new Error('Voice fitting gave up');

  const scenes: TimedScene[] = buildTimeline(plan, voice, spec);
  validateTimeline(scenes, spec, sceneRange(seconds).min);

  const key = characterKey(character);
  writeRegistry(character?.code && key ? [{key, code: character.code}] : []);
  const episode = index + 1;
  const props: VideoState['props'] = {
    episode,
    title: `${nicheById(niche).label} #${episode}`,
    scenes,
    words: voice.words as Word[],
    totalFrames: spec.totalFrames,
    character: key,
    ctaLabel: ctaLabel(cta, name),
    theme: resolveTheme(isThemeChoice(u.onboarding_data?.video_theme) ? u.onboarding_data.video_theme : null),
  };
  const features = featuresFor(plan, new Date(v.slot_at), s.timezone, seconds, cta, niche);
  await store.updateVideo(v.id, {plan, features, caption: captionFor(plan), duration_s: seconds, character_id: character?.id ?? null});
  saveState(ctx, job, {kind: 'video', videoId: v.id, props, voicePath: voice.wavPath, seconds});
}

async function prepareCharacters(ctx: WorkerCtx, job: JobRow) {
  const u = (await ctx.store.getUser(job.user_id!))!;
  const description = String(job.input.description ?? u.onboarding_data.description ?? '');
  const batch = Number(job.input.batch ?? 1);
  const cred = await credentialFor(ctx, u.id);
  let drafts;
  let voices: string[];
  try {
    ({drafts, voices} = await designCharacters(description, ctx.ask(cred)));
  } catch (e) {
    if (e instanceof CharacterRefused) {
      await ctx.store.updateUser(u.id, {onboarding_data: {...u.onboarding_data, awaiting: 'description', pending_job: null}});
      await ctx.msg.text(u.id, T.famous(e.message));
      saveState(ctx, job, {kind: 'none'});
      return;
    }
    throw e;
  }
  const withKeys = drafts.map((d, i) => ({...d, key: `cand${i + 1}`}));
  writeRegistry(withKeys.map((d) => ({key: d.key, code: d.code})));
  const samples = await makeVoiceSamples(path.join(dirFor(ctx, job), 'voices'), voices, null);
  saveState(ctx, job, {kind: 'character', batch, description, drafts: withKeys, voices: samples});
}

async function voiceSamplesJob(ctx: WorkerCtx, job: JobRow) {
  const u = (await ctx.store.getUser(job.user_id!))!;
  const charId = job.input.character as string | null;
  const c = charId ? await ctx.store.getCharacter(charId) : null;
  const voices = c?.description === PIP_BUILTIN ? ['am_puck', 'af_heart', 'bm_george'] : c ? ['af_heart', 'am_puck', 'bf_emma'] : ['af_heart', 'am_michael', 'bf_emma'];
  const batch = u.onboarding_data.character_batch ?? 0;
  const samples = await makeVoiceSamples(path.join(dirFor(ctx, job), 'voices'), voices, c?.name ?? null);
  for (const s of samples) await ctx.store.upload(`voices/${u.id}/${batch}/${s.voice}.ogg`, fs.readFileSync(s.file), 'audio/ogg');
  await ctx.store.updateUser(u.id, {onboarding_data: {...u.onboarding_data, voice_options: voices, pending_job: null}});
  await ctx.msg.text(u.id, T.pickVoice(c?.name ?? null));
  for (const [i, s] of samples.entries()) await ctx.msg.voice(u.id, s.file, `Voice ${i + 1}`);
  await ctx.msg.text(u.id, 'Which voice?', K.voices(voices));
  saveState(ctx, job, {kind: 'none'});
}

async function claudeCheckJob(ctx: WorkerCtx, job: JobRow) {
  const uid = job.user_id!;
  const cred = await credentialFor(ctx, uid);
  let ok = false;
  let why = 'no answer';
  try {
    const out = cred.kind === 'oauth_token' ? await ctx.claudeCode(cred.secret, 'Reply with the word OK and nothing else.') : await ctx.ask(cred)('Reply with the word OK and nothing else.', 'You are a test.');
    ok = /\bok\b/i.test(out);
    why = ok ? '' : 'unexpected answer';
  } catch (e) {
    why = /401|invalid|expired|unauthor/i.test((e as Error).message) ? 'the token was rejected' : 'Claude Code could not run';
  }
  const row = await ctx.store.getClaude(uid);
  if (row) await ctx.store.saveClaude({...row, last_checked_at: ctx.now().toISOString(), last_check_ok: ok});
  if (ok) await ctx.msg.text(uid, T.claudeCheckOk());
  else await ctx.msg.text(uid, T.claudeCheckFailed(why), K.claudeAgain());
  saveState(ctx, job, {kind: 'none'});
}

async function weeklyJob(ctx: WorkerCtx, job: JobRow) {
  const uid = job.user_id!;
  const weekStart = String(job.input.week_start);
  const a = await loadAnalytics(ctx.store, uid);
  const stats = videoStats(a);
  const scored = a.posted.map((v, i) => ({id: v.id, features: v.features ?? {}, score: goalScore(a.goal, stats[i])}));
  const {tooSmall, n, items} = findPatterns(scored);
  const hints = plannerHints(items, tooSmall);
  let summary = tooSmall
    ? `You have ${n} video${n === 1 ? '' : 's'}. With fewer than 15, the data is too small to be sure what works, so treat these as early guesses.`
    : `Based on ${n} videos. ${GOALS[a.goal].scoreNote}`;
  let changes = hints.filter((h) => h.startsWith('Do ')).map((h) => h.replace(/^Do more: /, 'More: ').replace(/^Do less: /, 'Less: '));
  try {
    const cred = await credentialFor(ctx, uid);
    const out = await ctx.ask(cred)(
      `Weekly TikTok analysis for a ${GOALS[a.goal].label} channel. ${GOALS[a.goal].scoreNote}\nVideos: ${n}. Too small to be sure: ${tooSmall}.\nTop 20% vs bottom 20% feature lifts (computed in code, do not invent numbers):\n${JSON.stringify(items)}\n\nReturn ONLY JSON {"summary": string (2 to 3 plain sentences, honest, say the data is too small if it is), "changes": [string] (max 4 short things the planner will do differently next week, only based on the lifts above)}`,
      'You are an honest analytics assistant. Plain, simple English. Never claim more certainty than the numbers allow.',
    );
    const {extractJson} = await import('../../src/plan.js');
    const j = extractJson(out);
    if (typeof j.summary === 'string') summary = j.summary.slice(0, 600);
    if (Array.isArray(j.changes)) changes = j.changes.map(String).slice(0, 4);
  } catch (e) {
    console.warn('Weekly summary by Claude failed, using the plain one:', redact((e as Error).message));
  }
  await ctx.store.savePattern({user_id: uid, week_start: weekStart, sample_size: n, too_small: tooSmall, summary, items, changes, active: true});
  await ctx.msg.text(uid, `📝 <b>Your weekly report is ready</b>\n${esc(summary)}\n\nSend /report for the details.`);
  saveState(ctx, job, {kind: 'none'});
}

// ---------- render (no secrets, no database) ----------
export async function render(ctx: WorkerCtx, jobId: string) {
  const dir = path.join(ctx.workDir, jobId);
  const st: State = fs.existsSync(path.join(dir, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')) : {kind: 'none'};
  if (st.kind === 'video') {
    const outPath = path.join(dir, 'video.mp4');
    await ctx.render.video({props: st.props, voicePath: st.voicePath, musicPath: null, outPath});
    await ctx.render.check(outPath, st.props.totalFrames);
    const thumbPath = path.join(dir, 'thumb.jpg');
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.6', '-i', outPath, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=540:-2', thumbPath], {stdio: 'ignore'});
    } catch {
      /* thumbnail is optional */
    }
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({...st, outPath, thumbPath: fs.existsSync(thumbPath) ? thumbPath : undefined}));
  } else if (st.kind === 'character') {
    let serveUrl: string | undefined;
    for (const d of st.drafts) {
      const png = path.join(dir, `${d.key}.png`);
      try {
        serveUrl = await ctx.render.still({compositionId: 'CharacterSheet', inputProps: {character: d.key, title: d.name}, outPath: png, frame: 12, serveUrl});
        d.png = png;
      } catch (e) {
        d.error = (e as Error).message.slice(0, 300);
      }
    }
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(st));
  }
}

// ---------- finish ----------
export async function finish(ctx: WorkerCtx, jobId: string) {
  const job = await ctx.store.getJob(jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const st = loadState(ctx, job);
  if (st.kind === 'video') await finishVideo(ctx, job, st);
  if (st.kind === 'character') await finishCharacters(ctx, job, st);
  const started = job.started_at ? new Date(job.started_at).getTime() : ctx.now().getTime();
  const minutes = Math.max(1, Math.ceil((ctx.now().getTime() - started) / 60000));
  await ctx.store.updateJob(job.id, {status: 'done', finished_at: ctx.now().toISOString(), minutes_used: minutes});
  await ctx.store.addActionsMinutes(minutes);
}

async function finishVideo(ctx: WorkerCtx, job: JobRow, st: VideoState) {
  const {store, msg} = ctx;
  const v = (await store.getVideo(st.videoId))!;
  const s = (await store.getSettings(v.user_id))!;
  const u = (await store.getUser(v.user_id))!;
  if (!st.outPath || !fs.existsSync(st.outPath)) throw new Error('render produced no video');

  if (v.is_dry_run) {
    if (st.thumbPath) await store.upload(`thumbs/${u.id}/${v.id}.jpg`, fs.readFileSync(st.thumbPath), 'image/jpeg');
    await store.updateVideo(v.id, {status: 'skipped', thumb_path: st.thumbPath ? `thumbs/${u.id}/${v.id}.jpg` : null});
    await msg.video(u.id, st.outPath, T.dryRunReady(nextSlotText(s, ctx.now())), K.preview(), st.thumbPath);
    return;
  }

  // creator_info before every post: allowed privacy levels and max length.
  let options: string[];
  let username: string;
  try {
    const {token, row} = await accessTokenFor(store, u.id);
    const info = await creatorInfo(token);
    if (info.max_video_post_duration_sec < st.seconds) throw new Error(`TikTok allows only ${info.max_video_post_duration_sec} s videos on this account`);
    options = info.privacy_level_options;
    username = info.creator_username || row.username || '';
  } catch (e) {
    if (e instanceof TikTokReconnectNeeded) {
      await store.updateVideo(v.id, {status: 'failed', error: 'TikTok login expired'});
      await msg.text(u.id, T.reconnect(), K.connectTikTok(authorizeUrl(signState(u.id))));
      return;
    }
    throw e;
  }

  const videoPath = `videos/${u.id}/${v.id}.mp4`;
  const thumbPath = st.thumbPath ? `thumbs/${u.id}/${v.id}.jpg` : null;
  await store.upload(videoPath, fs.readFileSync(st.outPath), 'video/mp4');
  if (thumbPath) await store.upload(thumbPath, fs.readFileSync(st.thumbPath!), 'image/jpeg');

  const when = fmtLocal(new Date(v.slot_at), s.timezone);
  if (s.mode === 'auto') {
    const privacy = choosePrivacy(s.privacy_default ?? 'PUBLIC_TO_EVERYONE', options);
    await store.updateVideo(v.id, {status: 'approved', video_path: videoPath, thumb_path: thumbPath, privacy_options: options, privacy});
    return;
  }
  await store.updateVideo(v.id, {status: 'awaiting_approval', video_path: videoPath, thumb_path: thumbPath, privacy_options: options, privacy: null});
  const msgId = await msg.video(u.id, st.outPath, T.approval(when, v.caption ?? '', username, false), K.approval(v.id, options, null), st.thumbPath);
  await store.updateVideo(v.id, {approval_msg_id: msgId});
}

async function finishCharacters(ctx: WorkerCtx, job: JobRow, st: CharacterState) {
  const {store, msg} = ctx;
  const uid = job.user_id!;
  const ok = st.drafts.filter((d) => d.png && fs.existsSync(d.png));
  if (!ok.length) throw new Error(`none of the characters rendered: ${st.drafts.map((d) => d.error).join(' | ')}`);
  const versions: number[] = [];
  const album: {file: string; caption: string}[] = [];
  for (const [i, d] of st.drafts.entries()) {
    if (!d.png || !fs.existsSync(d.png)) continue;
    const c = await store.insertCharacter({user_id: uid, name: d.name, description: st.description, batch: st.batch, version: i + 1, status: 'candidate', code: d.code});
    const preview = `previews/${uid}/${c.id}.png`;
    await store.upload(preview, fs.readFileSync(d.png), 'image/png');
    await store.updateCharacter(c.id, {preview_path: preview, code_sha256: sha256(d.code)});
    versions.push(i + 1);
    album.push({file: d.png, caption: `${i + 1} · ${d.name}`});
  }
  for (const s of st.voices) await store.upload(`voices/${uid}/${st.batch}/${s.voice}.ogg`, fs.readFileSync(s.file), 'audio/ogg');
  const u = (await store.getUser(uid))!;
  await store.updateUser(uid, {onboarding_data: {...u.onboarding_data, voice_options: st.voices.map((x) => x.voice), pending_job: null, character_batch: st.batch}});
  await msg.album(uid, album);
  await msg.text(uid, T.pickCharacter(), K.pickCharacter(versions));
}

// ---------- failure ----------
export async function fail(ctx: WorkerCtx, jobId: string, reason = 'the job stopped with an error') {
  const job = await ctx.store.getJob(jobId);
  if (!job || job.status === 'done' || job.status === 'failed') return;
  const clean = redact(reason).slice(0, 500);
  await ctx.store.updateJob(job.id, {status: 'failed', finished_at: ctx.now().toISOString(), log: clean});
  if (!job.user_id) return;
  const what: Record<string, string> = {
    render: 'making your video',
    dry_run: 'making your test video',
    character_preview: 'drawing your characters',
    voice_samples: 'making voice samples',
    claude_check: 'testing your Claude token',
    weekly_analysis: 'writing your weekly report',
  };
  if (job.video_id) {
    const v = await ctx.store.getVideo(job.video_id);
    if (v) {
      await ctx.store.updateVideo(v.id, {status: 'failed', error: clean});
      const s = await ctx.store.getSettings(v.user_id);
      await ctx.msg.text(job.user_id, T.failed(v.is_dry_run ? 'test' : fmtLocal(new Date(v.slot_at), s?.timezone ?? 'UTC'), plainReason(clean)), K.retry(`retry:${v.id}`));
      return;
    }
  }
  const u = await ctx.store.getUser(job.user_id);
  if (u && ['character_preview', 'voice_samples'].includes(job.kind)) await ctx.store.updateUser(u.id, {onboarding_data: {...u.onboarding_data, pending_job: null}});
  if (job.kind !== 'weekly_analysis') await ctx.msg.text(job.user_id, T.jobFailed(what[job.kind] ?? 'working'), K.retry(`rj:${job.id}`));
}

/** Turns an internal error into one short sentence a user can act on. */
export function plainReason(err: string): string {
  if (/Claude is not connected/i.test(err)) return 'Claude is not connected.';
  if (/credit|billing|balance/i.test(err)) return 'your Anthropic account is out of credit.';
  if (/401|authentication|invalid x-api-key|token was rejected/i.test(err)) return 'your Claude key or token stopped working.';
  if (/TikTok allows only/i.test(err)) return err.replace(/^.*?(TikTok allows only[^.]*).*$/s, '$1.');
  if (/tiktok|spam_risk|rate_limit/i.test(err)) return 'TikTok refused the upload. I will try again if you tap Retry.';
  if (/plan|Claude could not/i.test(err)) return 'Claude could not write a good script this time.';
  if (/Duration check|render/i.test(err)) return 'the video did not render correctly.';
  return 'something went wrong on my side.';
}

export {FPS};
export type {UserRow, SettingsRow, VideoRow};
