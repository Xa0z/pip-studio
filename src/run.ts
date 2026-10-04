/**
 * One full cycle: plan -> voice -> render -> check -> publish -> log.
 *   tsx src/run.ts                 one video for the next slot (what the cron runs)
 *   tsx src/run.ts --wait          wait for the slot time before posting (cron uses this)
 *   DRY_RUN=true tsx src/run.ts --count 3    3 videos, nothing is published or saved to history
 *   PLAN_FIXTURES=venus,heart      use hand-written plans from fixtures/ instead of Claude
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {config, OUT_DIR, ROOT} from './config.js';
import {HistoryEntry, isRepeatTopic, loadHistory, nextCategory, saveHistory} from './history.js';
import {log} from './log.js';
import {checkMonthlyMinutes} from './minutes.js';
import {notify, runUrl} from './notify.js';
import {layoutForEpisode, planVideo, revisePlan} from './plan.js';
import {checkDuration, pickMusic, renderVideo} from './render.js';
import {Category, Plan, PlanSchema} from './schema.js';
import {buildTimeline, validateTimeline, voiceProblems} from './timeline.js';
import {isDryRun, sleep} from './util.js';
import {synthesize, VoiceResult} from './voice.js';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = isDryRun();
const COUNT = Number(arg('count') ?? (DRY ? 3 : 1));
const WAIT = args.includes('--wait');
const START = Date.now();
const MAX_WAIT_AFTER_START_MS = 14 * 60 * 1000; // job timeout is 20 min, keep room to upload

// ---------- time helpers ----------
const tzOffsetMs = (at: Date, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime();
};

/** The slot this run is for: the next slot within the coming 3 hours, else the nearest one. */
function currentSlot(now = new Date()): {slot: string; at: Date} {
  const tz = config.TIMEZONE;
  const local = new Date(now.getTime() + tzOffsetMs(now, tz));
  const candidates = [-1, 0, 1].flatMap((d) =>
    config.SLOTS.map((slot) => {
      const [h, m] = slot.split(':').map(Number);
      const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d, h, m);
      return {slot, at: new Date(guess - tzOffsetMs(new Date(guess), tz))};
    }),
  );
  const upcoming = candidates.filter((c) => c.at.getTime() >= now.getTime() - 30 * 60000).sort((a, b) => a.at.getTime() - b.at.getTime());
  return upcoming[0];
}

// ---------- steps ----------
async function getPlan(i: number, episode: number, category: Category, pastTopics: string[]): Promise<Plan> {
  const fixtures = process.env.PLAN_FIXTURES?.split(',').map((s) => s.trim()).filter(Boolean);
  if (fixtures?.length) {
    const name = fixtures[i % fixtures.length];
    log.info(`Using hand-written plan fixtures/${name}.json`);
    return PlanSchema.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', `${name}.json`), 'utf8')));
  }
  return planVideo({episode, category, pastTopics, startLayout: layoutForEpisode(episode)});
}

/** Fits the voice into 58–61 s: first by Kokoro speed (0.9–1.1), then by asking Claude to rewrite (max 4). */
async function makeVoice(plan: Plan, dir: string): Promise<{plan: Plan; voice: VoiceResult}> {
  let speed = config.VOICE_SPEED;
  let rewrites = 0;
  for (let round = 1; round <= 12; round++) {
    const voice = await synthesize(plan, dir, speed, config.PIP_VOICE, 59.5);
    const problems = voiceProblems(plan, voice);
    log.info(`Voice round ${round}: ${voice.speechEnd.toFixed(2)} s of speech at speed ${speed.toFixed(3)}`);
    if (!problems.length) return {plan, voice};

    const lengthOnly = problems.every((p) => p.startsWith('spoken length'));
    const target = 59.5;
    // Kokoro time scales roughly with 1/speed.
    const wanted = (speed * voice.speechEnd) / target;
    const clamped = Math.min(1.1, Math.max(0.9, wanted));
    const fitsAfter = (voice.speechEnd * speed) / clamped;
    if (Math.abs(clamped - speed) > 0.004 && fitsAfter >= 57.5) {
      log.info(`Adjusting speed ${speed.toFixed(3)} -> ${clamped.toFixed(3)}`);
      speed = clamped;
      continue;
    }
    if (rewrites >= 4) throw new Error(`Voice still does not fit after 4 rewrites: ${problems.join('; ')}`);
    rewrites++;
    const wordsPerSec = plan.scenes.reduce((n, s) => n + s.narration.split(/\s+/).length, 0) / voice.speechEnd;
    const diff = Math.round((target - voice.speechEnd) * wordsPerSec);
    const hint = lengthOnly ? [`${diff > 0 ? 'add' : 'remove'} about ${Math.abs(diff)} words in total`] : [];
    log.warn(`Rewrite ${rewrites}/4: ${problems.join('; ')}`);
    if (process.env.PLAN_FIXTURES) throw new Error(`Fixture plan does not fit: ${problems.join('; ')}`);
    plan = await revisePlan(plan, [...problems, ...hint]);
    speed = config.VOICE_SPEED;
  }
  throw new Error('Voice fitting gave up');
}

const captionText = (plan: Plan, title: string) => `${plan.caption}\n\n${title} ${plan.hashtags.join(' ')}`.slice(0, 2200);

type Result = {episode: number; ok: boolean; dir?: string; topic?: string; error?: string; seconds: number};

async function makeOne(i: number, episode: number, category: Category, pastTopics: string[]): Promise<{result: Result; entry?: HistoryEntry; plan?: Plan}> {
  const t0 = Date.now();
  const title = `Did you know? #${episode}`;
  const dir = path.join(OUT_DIR, `${new Date().toISOString().slice(0, 10)}-ep${episode}`);
  fs.mkdirSync(dir, {recursive: true});
  let plan: Plan | undefined;
  try {
    log.step(`${title}`, `category ${category}`);

    log.step('1/5 plan');
    plan = await getPlan(i, episode, category, pastTopics);
    const dup = isRepeatTopic(plan.topic, pastTopics);
    if (dup && !process.env.PLAN_FIXTURES) throw new Error(`Topic repeats an earlier one: ${dup}`);
    log.ok(`Topic: ${plan.topic} (${plan.scenes.length} scenes). Source: ${plan.source}`);

    log.step('2/5 voice');
    const fitted = await makeVoice(plan, dir);
    plan = fitted.plan;
    const voice = fitted.voice;

    log.step('3/5 timeline');
    const scenes = buildTimeline(plan, voice);
    validateTimeline(scenes);
    log.ok(`Scenes: ${scenes.map((s) => s.durationInFrames).join(' + ')} = 1860 frames`);
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({episode, title, ...plan}, null, 2));
    fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify({scenes, words: voice.words, speechEnd: voice.speechEnd, speed: voice.speed}, null, 2));

    log.step('4/5 render');
    const video = path.join(dir, 'video.mp4');
    await renderVideo({props: {episode, title, scenes, words: voice.words}, voicePath: voice.wavPath, musicPath: pickMusic(episode), outPath: video});
    await checkDuration(video);
    fs.writeFileSync(path.join(dir, 'caption.txt'), captionText(plan, title) + '\n');

    if (DRY) {
      log.ok(`DRY_RUN: saved ${path.relative(ROOT, dir)}, not publishing`);
      return {result: {episode, ok: true, dir, topic: plan.topic, seconds: (Date.now() - t0) / 1000}, plan};
    }

    log.step('5/5 publish');
    const {slot, at} = currentSlot();
    if (WAIT) {
      const waitMs = Math.min(at.getTime() - Date.now(), START + MAX_WAIT_AFTER_START_MS - Date.now());
      if (waitMs > 0) {
        log.info(`Waiting ${Math.round(waitMs / 1000)} s for the ${slot} slot`);
        await sleep(waitMs);
      }
    }
    const {getAccessToken} = await import('./auth.js');
    const {publishVideo} = await import('./publish.js');
    const token = await getAccessToken();
    const pub = await publishVideo(video, captionText(plan, title), token);
    log.ok(`Published to @${pub.username} (${pub.privacy}), publish_id ${pub.publishId}`);
    const entry: HistoryEntry = {
      episode,
      title,
      date: new Date().toISOString(),
      slot,
      category: plan.category,
      topic: plan.topic,
      mainFact: plan.mainFact,
      caption: plan.caption,
      hashtags: plan.hashtags,
      source: plan.source,
      status: pub.privacy === 'INBOX' ? 'inbox' : 'published',
      publishId: pub.publishId,
      privacy: pub.privacy,
    };
    return {result: {episode, ok: true, dir, topic: plan.topic, seconds: (Date.now() - t0) / 1000}, entry, plan};
  } catch (e) {
    const msg = (e as Error).message;
    log.error(`${title} failed: ${msg}`);
    fs.writeFileSync(path.join(dir, 'error.txt'), (e as Error).stack ?? msg);
    return {result: {episode, ok: false, dir, topic: plan?.topic, error: msg, seconds: (Date.now() - t0) / 1000}, plan};
  }
}

async function main() {
  log.step('Pip Explains run', `${DRY ? 'DRY_RUN, ' : ''}${COUNT} video(s)`);
  const history = loadHistory();
  const pastTopics = history.videos.map((v) => v.topic);
  let lastCategory = history.videos.at(-1)?.category;
  const results: Result[] = [];

  for (let i = 0; i < COUNT; i++) {
    const episode = history.nextEpisode + (DRY ? i : 0);
    const category = nextCategory(lastCategory);
    const {result, entry, plan} = await makeOne(i, episode, category, pastTopics);
    results.push(result);
    lastCategory = category;
    if (plan) pastTopics.push(plan.topic);
    if (entry && !DRY) {
      history.videos.push(entry);
      history.nextEpisode = episode + 1;
      saveHistory(history);
    }
  }

  const total = (Date.now() - START) / 1000;
  log.step('Summary');
  for (const r of results) log.info(`#${r.episode} ${r.ok ? '✔' : '✖'} ${r.topic ?? ''} (${r.seconds.toFixed(0)} s)${r.error ? ' - ' + r.error : ''}`);
  log.info(`Run time: ${(total / 60).toFixed(1)} min`);
  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify({dryRun: DRY, runSeconds: total, results}, null, 2));
  if (!DRY) {
    fs.mkdirSync(path.join(ROOT, 'state'), {recursive: true});
    fs.appendFileSync(path.join(ROOT, 'state', 'runs.jsonl'), JSON.stringify({at: new Date().toISOString(), runSeconds: Math.round(total), results}) + '\n');
  }
  await checkMonthlyMinutes();

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    await notify(`❌ Pip Explains: ${failed.length} of ${results.length} video(s) failed${DRY ? ' (dry run)' : ''}.\n${failed.map((f) => `#${f.episode}: ${f.error}`).join('\n')}\n${runUrl()}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  log.error((e as Error).stack ?? String(e));
  await notify(`❌ Pip Explains run crashed: ${(e as Error).message}\n${runUrl()}`);
  process.exit(1);
});
