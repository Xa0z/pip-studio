/**
 * Local end-to-end run with fake TikTok, fake Telegram and canned Claude answers, but REAL
 * Remotion renders (character sheets and the 62 s test video). Then screenshots of the chat
 * and of the Mini App dashboard (with a month of made-up stats).
 *
 *   npm run simulate -- [outDir] [--fast]
 *
 * --fast skips real rendering. Needs Chromium (REMOTION_BROWSER_EXECUTABLE) and ffmpeg.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {statsChartPng} from '../lib/charts.js';
import {aadFor, encryptSecret} from '../lib/crypto.js';
import {signInitData} from '../lib/initdata.js';
import {MemoryStore} from '../lib/memory-store.js';
import {findPatterns} from '../lib/patterns.js';
import {goalScore} from '../lib/goals.js';
import {CHECKPOINTS} from '../lib/metrics.js';
import {dashboardApi} from '../server/handlers.js';
import {realRenderer, type Renderer} from '../worker/context.js';
import {fakeRenderer, Harness, runOnboarding, TEST_ENV, type ChatItem} from './harness.js';
import {weeklyAnswer} from './fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const FAST = args.includes('--fast');
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'out', 'simulation'));
const WORK = path.join(ROOT, 'out', 'simulation-work');
const OWNER = 5550001;

for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;
const HEADLESS = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (!process.env.REMOTION_BROWSER_EXECUTABLE && fs.existsSync(HEADLESS)) process.env.REMOTION_BROWSER_EXECUTABLE = HEADLESS;
const BROWSER = process.env.CHROMIUM_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

const log = (...a: unknown[]) => console.log('[simulate]', ...a);
const AVATAR = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#73847C"/><text x="50" y="64" font-size="44" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="bold">NF</text></svg>',
).toString('base64')}`;

// ---------------------------------------------------------------- chat run
async function runChat() {
  const registry = path.join(ROOT, 'remotion/character/registry.tsx');
  const original = fs.readFileSync(registry, 'utf8');
  fs.rmSync(WORK, {recursive: true, force: true});
  fs.mkdirSync(WORK, {recursive: true});
  let t = new Date('2026-10-05T06:40:00Z').getTime(); // Monday 09:40 in Baghdad
  const clock = {now: () => new Date(t), set: (iso: string) => (t = new Date(iso).getTime())};
  const h = new Harness({
    userId: OWNER,
    ownerId: OWNER,
    firstName: 'Ahmad',
    renderer: FAST ? fakeRenderer : realRenderer,
    workDir: WORK,
    now: clock.now,
    statsChart: statsChartPng,
    tiktok: {avatarUrl: AVATAR, followers: 1240, privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY']},
  });
  const marks: {title: string; from: number}[] = [];
  const mark = (title: string) => marks.push({title, from: h.chat.length});
  try {
    mark('Steps 1 and 2: TikTok and Claude');
    const started = Date.now();
    // runOnboarding does every step; marks are added by watching the chat afterwards
    const results = await runOnboarding(h);
    log('onboarding jobs', results, `${((Date.now() - started) / 1000).toFixed(0)} s`);
    if (!results.every((r) => r.ok)) throw new Error('onboarding failed');
    await h.press('pv:ok');

    // Split the onboarding into screens by step headers.
    marks.length = 0;
    const find = (re: RegExp) => h.chat.findIndex((m) => re.test(m.text ?? ''));
    marks.push({title: 'Start and Step 1: connect TikTok', from: 0});
    marks.push({title: 'Steps 2 to 4: Claude, niche, goal', from: find(/Step 2 of 6/) - 1});
    marks.push({title: 'Step 5: character and voice', from: find(/Step 5 of 6/)});
    marks.push({title: 'Step 6: schedule, mode, summary, test video', from: find(/Step 6 of 6/)});

    // Daily run: plan, approve, post, stats. Reuse the test video so this part is quick.
    const dry = [...h.store.videos.values()].find((v) => v.is_dry_run)!;
    const dryDir = path.join(WORK, [...h.store.jobs.values()].find((j) => j.video_id === dry.id)!.id);
    const copyRenderer: Renderer = {
      ...fakeRenderer,
      video: (async ({outPath}: {outPath: string}) => fs.copyFileSync(path.join(dryDir, 'video.mp4'), outPath)) as unknown as Renderer['video'],
    };
    if (fs.existsSync(path.join(dryDir, 'video.mp4'))) h.ctx.render = copyRenderer;
    mark('Daily: approval and posting');
    clock.set('2026-10-05T07:50:00Z');
    await h.tick();
    await h.runJobs();
    const v = [...h.store.videos.values()].find((x) => !x.is_dry_run)!;
    await h.press(`ap:pv:${v.id}:0`);
    await h.press(`ap:post:${v.id}`);
    clock.set('2026-10-05T08:59:00Z');
    await h.tick();
    h.tiktok.posts[0].views = 3400;
    h.tiktok.posts[0].likes = 410;
    h.tiktok.posts[0].comments = 37;
    h.tiktok.posts[0].shares = 22;
    h.tiktok.followers = 1310;
    clock.set('2026-10-05T10:05:00Z');
    await h.tick();
    clock.set('2026-10-05T15:30:00Z');
    await h.tick();
    mark('Commands: /stats and /dashboard');
    await h.say('/stats');
    await h.say('/dashboard');
    return {chat: h.chat, marks, store: h.store, dryDir};
  } finally {
    h.close();
    fs.writeFileSync(registry, original);
  }
}

// ---------------------------------------------------------------- chat screenshots
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Telegram HTML subset -> safe HTML (the bot only uses b, i, code, a). */
function tgHtml(s: string) {
  return esc(s)
    .replace(/&lt;(\/?)(b|i|code|u|s)&gt;/g, '<$1$2>')
    .replace(/&lt;a href="([^"]+)"&gt;/g, '<a href="$1">')
    .replace(/&lt;\/a&gt;/g, '</a>')
    .replace(/&amp;(lt|gt|amp|quot);/g, '&$1;')
    .replace(/\n/g, '<br>');
}

function dataUri(file: string) {
  if (file.startsWith('data:')) return file;
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : null;
  if (!mime) return null;
  const buf = fs.readFileSync(file);
  if (buf.length < 100) return null; // placeholder files from --fast
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function bubble(m: ChatItem, thumbFor: (m: ChatItem) => string | null) {
  if (m.kind === 'press') return `<div class="row me"><div class="press">${esc(m.text ?? '')}</div></div>`;
  if (m.kind === 'system') return `<div class="sys">${esc(m.text ?? '')}</div>`;
  if (m.kind === 'alert') return `<div class="alert">${esc(m.text ?? '')}</div>`;
  const me = m.from === 'user';
  let media = '';
  if (m.kind === 'photo') {
    const src = m.media?.[0] && dataUri(m.media[0]);
    media = src ? `<img class="photo ${m.media![0].startsWith('data:image/svg') ? 'avatar' : ''}" src="${src}">` : '<div class="photo ph">📷 photo</div>';
  } else if (m.kind === 'album') {
    media = `<div class="m-album">${(m.media ?? []).map((f) => (dataUri(f) ? `<img src="${dataUri(f)}">` : '<div class="ph">🖼</div>')).join('')}</div>`;
  } else if (m.kind === 'video') {
    const src = thumbFor(m);
    media = `<div class="m-video">${src ? `<img src="${src}">` : '<div class="ph"></div>'}<span class="play">▶</span><span class="dur">1:02</span></div>`;
  } else if (m.kind === 'voice') {
    const bars = Array.from({length: 34}, (_, i) => `<i style="height:${6 + Math.round(14 * Math.abs(Math.sin(i * 1.7 + (m.id % 5))))}px"></i>`).join('');
    media = `<div class="m-voice"><span class="vplay">▶</span><span class="wave">${bars}</span><span class="vdur">0:04</span></div>`;
  }
  const text = m.deleted ? '<i class="del">🗑 Message deleted by the bot</i>' : m.text ? `<div class="txt">${me ? esc(m.text) : tgHtml(m.text)}</div>` : '';
  const buttons = m.buttons?.length
    ? `<div class="kb">${m.buttons.map((row) => `<div class="kbrow">${row.map((b) => `<span class="btn">${esc(b.text)}${b.url ? ' ↗' : ''}${b.web_app ? ' ⧉' : ''}</span>`).join('')}</div>`).join('')}</div>`
    : '';
  return `<div class="row ${me ? 'me' : ''}"><div class="msg ${me ? 'out' : 'in'} ${m.kind}">${media}${text}</div></div>${buttons ? `<div class="row">${buttons}</div>` : ''}`;
}

const CHAT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.38 -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0e1621; color: #f5f5f5; width: 430px; }
.top { position: sticky; top: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #17212b; border-bottom: 1px solid #0b1118; z-index: 2; }
.top .av { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #ff8a3d, #7b2ff7); display: grid; place-items: center; font-weight: 700; }
.top b { display: block; } .top small { color: #6c7883; }
.chapter { margin: 10px auto 4px; text-align: center; } .chapter span { background: rgba(0,0,0,.35); color: #e4ecf2; padding: 3px 10px; border-radius: 12px; font-size: 12.5px; }
.feed { padding: 4px 8px 14px; background: #0e1621 radial-gradient(circle at 20% 10%, #13202d 0, transparent 40%); }
.row { display: flex; margin: 3px 0; } .row.me { justify-content: flex-end; }
.msg { max-width: 82%; padding: 6px 10px 7px; border-radius: 14px; word-wrap: break-word; }
.msg.in { background: #182533; border-bottom-left-radius: 4px; } .msg.out { background: #2b5278; border-bottom-right-radius: 4px; }
.msg.photo, .msg.video, .msg.album { padding: 3px; } .msg.photo .txt, .msg.video .txt, .msg.album .txt { padding: 4px 7px 3px; }
.txt code { background: rgba(255,255,255,.08); padding: 0 4px; border-radius: 4px; font-size: 13px; color: #8be9fd; }
.txt a { color: #6ab3f3; text-decoration: none; }
.del { color: #8a99a8; }
.photo { display: block; width: 100%; border-radius: 11px; } .photo.avatar { width: 150px; height: 150px; }
.m-album { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; width: 320px; } .m-album img { width: 100%; display: block; border-radius: 6px; } .m-album img:first-child { grid-column: 1 / -1; }
.m-video { position: relative; width: 210px; } .m-video img { width: 100%; display: block; border-radius: 11px; } .m-video .ph { height: 370px; background: #223; border-radius: 11px; }
.play { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); width: 52px; height: 52px; border-radius: 50%; background: rgba(0,0,0,.45); display: grid; place-items: center; font-size: 22px; }
.dur { position: absolute; left: 8px; top: 8px; background: rgba(0,0,0,.5); font-size: 11.5px; padding: 1px 6px; border-radius: 8px; }
.m-voice { display: flex; align-items: center; gap: 8px; width: 230px; } .vplay { width: 38px; height: 38px; border-radius: 50%; background: #5288c1; display: grid; place-items: center; font-size: 15px; }
.wave { display: flex; align-items: center; gap: 2px; flex: 1; } .wave i { width: 3px; background: #6ab3f3; border-radius: 2px; } .vdur { font-size: 12px; color: #8a99a8; }
.msg.voice .txt { font-size: 12.5px; color: #8a99a8; margin-top: 2px; }
.kb { width: 82%; display: flex; flex-direction: column; gap: 3px; margin-top: -1px; } .kbrow { display: flex; gap: 3px; }
.btn { flex: 1; text-align: center; background: rgba(24,37,51,.85); color: #fff; padding: 7px 6px; border-radius: 9px; font-size: 13.5px; font-weight: 500; }
.press { font-size: 12.5px; color: #8fb8de; background: rgba(43,82,120,.35); border: 1px dashed #2b5278; padding: 3px 9px; border-radius: 10px; }
.press::before { content: 'tapped: '; color: #6c7883; }
.sys, .alert { text-align: center; margin: 8px auto; font-size: 12.5px; color: #c8d4df; background: rgba(0,0,0,.35); padding: 4px 10px; border-radius: 10px; width: fit-content; max-width: 86%; }
.alert { background: #2a3442; color: #fff; }
`;

async function chatScreenshots(chat: ChatItem[], marks: {title: string; from: number}[], dryDir: string, browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const thumbs = new Map<string, string | null>();
  const thumbFor = (m: ChatItem) => {
    const f = m.media?.[0];
    if (!f) return null;
    if (!thumbs.has(f)) {
      let src = dataUri(f);
      if (!src) {
        const t = path.join(dryDir, 'thumb.jpg');
        src = dataUri(t);
      }
      thumbs.set(f, src);
    }
    return thumbs.get(f)!;
  };
  const files: string[] = [];
  const page = await browser.newPage({viewport: {width: 430, height: 900}, deviceScaleFactor: 2});
  for (const [i, m] of marks.entries()) {
    const end = marks[i + 1]?.from ?? chat.length;
    const items = chat.slice(Math.max(0, m.from), end);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CHAT_CSS}</style></head><body>
      <div class="top"><div class="av">P</div><div><b>Pip Studio</b><small>bot</small></div></div>
      <div class="feed"><div class="chapter"><span>${esc(m.title)}</span></div>${items.map((x) => bubble(x, thumbFor)).join('\n')}</div></body></html>`;
    await page.setContent(html, {waitUntil: 'load'});
    const file = path.join(OUT, `chat-${i + 1}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`);
    await page.screenshot({path: file, fullPage: true});
    files.push(file);
  }
  await page.close();
  return files;
}

// ---------------------------------------------------------------- dashboard
class DemoStore extends MemoryStore {
  async signedUrl(p: string) {
    return `/media/${p}`;
  }
}

/** A month of believable numbers for one channel. Deterministic. */
async function seedDemo(store: DemoStore, now: Date, thumbs: Buffer[]) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const uid = OWNER;
  await store.createUser({id: uid, tg_username: 'ahmad', first_name: 'Ahmad', is_owner: true});
  await store.updateUser(uid, {status: 'active', onboarding_step: 7});
  await store.saveSettings({user_id: uid, niches: ['science', 'history'], goal: 'creator_rewards', link_url: null, timezone: 'Asia/Baghdad', posts_per_day: 2, post_times: ['12:00', '20:00'], mode: 'approval', experiment_rate: 0.2, privacy_default: null});
  await store.saveTikTok({
    user_id: uid, open_id: 'open-demo', username: 'nova.facts', display_name: 'Nova Facts', avatar_url: AVATAR,
    access_token_enc: encryptSecret('act.demo-demo-demo', aadFor.tiktokAccess(uid)), refresh_token_enc: encryptSecret('rft.demo-demo-demo', aadFor.tiktokRefresh(uid)),
    access_expires_at: new Date(now.getTime() + 86400000).toISOString(), refresh_expires_at: new Date(now.getTime() + 300 * 86400000).toISOString(), scopes: [],
  } as any);
  thumbs.forEach((b, i) => store.upload(`thumbs/${uid}/demo${i}.jpg`, b, 'image/jpeg'));

  const topics: [string, string, string][] = [
    ['A day on Venus is longer than its year', 'planets', 'shock'], ['Why octopuses have three hearts', 'animals', 'question'],
    ['The Great Pyramid was once white', 'ancient egypt', 'myth'], ['Honey never goes bad', 'food science', 'shock'],
    ['Saturn would float in a bathtub', 'planets', 'number'], ['Cleopatra lived closer to the Moon landing', 'ancient egypt', 'shock'],
    ['Your bones are stronger than steel', 'human body', 'promise'], ['Romans used urine to clean teeth', 'ancient rome', 'story'],
    ['Lightning is hotter than the Sun', 'weather', 'number'], ['Sharks are older than trees', 'animals', 'shock'],
    ['The Eiffel Tower grows in summer', 'physics', 'question'], ['Vikings never wore horned helmets', 'vikings', 'myth'],
    ['A teaspoon of neutron star', 'stars', 'number'], ['Oxford is older than the Aztecs', 'medieval', 'shock'],
    ['Bananas are slightly radioactive', 'food science', 'question'], ['Mars has the tallest volcano', 'planets', 'number'],
    ['The shortest war lasted 38 minutes', 'modern history', 'story'], ['Octopus arms can taste', 'animals', 'question'],
    ['Light from the Sun is 8 minutes old', 'stars', 'promise'], ['Napoleon was not short', 'modern history', 'myth'],
    ['There are more trees than stars in our galaxy', 'planets', 'shock'], ['Water can boil and freeze at once', 'physics', 'question'],
    ['The Moon is drifting away', 'planets', 'number'], ['Ancient Egyptians had toothpaste', 'ancient egypt', 'story'],
  ];
  const start = Math.floor(now.getTime() / 86400000) * 86400000 - 30 * 86400000; // midnight UTC, 30 days ago
  let followers = 120;
  const account: {t: number; f: number}[] = [];
  const posted: {id: string; at: number; final: number; cat: string; hook: string}[] = [];
  for (let i = 0; i < topics.length; i++) {
    const [topic, cat, hook] = topics[i];
    const day = Math.floor((i * 29) / topics.length);
    const evening = i % 2 === 1;
    const at = start + day * 86400000 + (evening ? 17 : 9) * 3600000 + 4 * 60000;
    const quality = (hook === 'shock' ? 1.8 : hook === 'number' ? 1.3 : hook === 'myth' ? 1.1 : 0.8) * (cat === 'planets' ? 1.5 : 1) * (evening ? 1.25 : 0.9);
    const growthFactor = 1 + i / 10;
    let final = Math.round(600 * quality * growthFactor * (0.6 + rnd() * 0.8));
    if (i === 12 || i === 20) final *= 4; // two videos take off
    const v = await store.insertVideo({user_id: uid, slot_at: new Date(at - 4 * 60000).toISOString(), status: 'posted', character_id: null, is_experiment: i % 5 === 4});
    const lp = new Date(at + 3 * 3600000);
    await store.updateVideo(v.id, {
      posted_at: new Date(at).toISOString(), caption: `${topic}? Most people get this wrong 👀\n\n#facts #science`, duration_s: 62,
      plan: {topic, category: cat} as any, share_url: `https://www.tiktok.com/@nova.facts/video/74${String(1e15 + i)}`, tiktok_video_id: `74${String(1e15 + i)}`,
      thumb_path: `thumbs/${uid}/demo${i % thumbs.length}.jpg`, privacy: 'PUBLIC_TO_EVERYONE',
      features: {niche: cat.includes('egypt') || cat.includes('rome') || cat.includes('history') || cat.includes('vikings') || cat.includes('medieval') ? 'history' : 'science', topic, category: cat, hook_type: hook, length_s: 62, local_hour: lp.getUTCHours(), weekday: lp.getUTCDay(), caption_style: 'question', cta_type: 'follow'} as any,
    });
    posted.push({id: v.id, at, final, cat, hook});
  }
  // video snapshots
  for (const p of posted) {
    for (const c of CHECKPOINTS) {
      const t = p.at + c.hours * 3600000 + 7 * 60000;
      if (t > now.getTime()) break;
      const share = 1 - Math.exp(-c.hours / 30);
      const views = Math.round(p.final * share);
      const likeRate = 0.07 + (p.hook === 'shock' ? 0.03 : 0) + rnd() * 0.02;
      await store.insertVideoMetric({video_id: p.id, checkpoint: c.name, captured_at: new Date(t).toISOString(), views, likes: Math.round(views * likeRate), comments: Math.round(views * 0.009), shares: Math.round(views * 0.006)});
    }
  }
  // account snapshots every 6 h, followers follow total views
  for (let t = start; t <= now.getTime(); t += 6 * 3600000) {
    const views = posted.reduce((n, p) => (t > p.at ? n + p.final * (1 - Math.exp(-((t - p.at) / 3600000) / 30)) : n), 0);
    followers = Math.round(120 + views * 0.018);
    account.push({t, f: followers});
    await store.insertAccountMetric({user_id: uid, captured_at: new Date(t).toISOString(), followers, following: 4, likes: Math.round(views * 0.09), video_count: posted.filter((p) => p.at < t).length});
  }
  // weekly report from the real pattern finder
  const scored = await Promise.all(
    posted.map(async (p) => {
      const v = (await store.getVideo(p.id))!;
      const last = (await store.listVideoMetrics([p.id])).at(-1)!;
      return {id: p.id, features: v.features ?? {}, score: goalScore('creator_rewards', last)};
    }),
  );
  const found = findPatterns(scored);
  const w = JSON.parse(weeklyAnswer());
  await store.savePattern({user_id: uid, week_start: '2026-09-28', sample_size: found.n, too_small: found.tooSmall, summary: `Based on ${found.n} videos. Shocking first lines and space topics got the most views; evening posts did better than midday ones.`, items: found.items, changes: w.changes, active: true});
}

async function dashboardScreenshots(browser: Awaited<ReturnType<typeof chromium.launch>>, thumbs: Buffer[]) {
  if (!fs.existsSync(path.join(ROOT, 'public/app/index.html'))) execFileSync('npm', ['run', 'build:webapp'], {cwd: ROOT, stdio: 'inherit'});
  const store = new DemoStore();
  const now = new Date('2026-10-05T15:30:00Z');
  await seedDemo(store, now, thumbs);
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const initData = signInitData({auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({id: OWNER, first_name: 'Ahmad'}), query_id: 'demo'}, token);
  const appDir = path.join(ROOT, 'public');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api/dashboard') {
        const r = await dashboardApi(new Request(url, {headers: {'x-telegram-init-data': String(req.headers['x-telegram-init-data'] ?? '')}}), store, token, now);
        res.writeHead(r.status, {'Content-Type': 'application/json'});
        res.end(await r.text());
        return;
      }
      if (url.pathname.startsWith('/media/')) {
        const f = store.files.get(decodeURIComponent(url.pathname.slice(7)));
        res.writeHead(f ? 200 : 404, {'Content-Type': f?.contentType ?? 'text/plain'});
        res.end(f?.data ?? 'missing');
        return;
      }
      let file = path.join(appDir, url.pathname);
      if (!file.startsWith(appDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(appDir, 'app/index.html');
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, {'Content-Type': type});
      res.end(fs.readFileSync(file));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise<void>((r) => server.listen(4319, r));
  const files: string[] = [];
  try {
    for (const theme of ['dark', 'light'] as const) {
      const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, colorScheme: theme});
      const vars =
        theme === 'dark'
          ? {bg_color: '#17212b', secondary_bg_color: '#0e1621', text_color: '#f5f5f5', hint_color: '#708499', button_color: '#ff7a1a', button_text_color: '#ffffff'}
          : {bg_color: '#ffffff', secondary_bg_color: '#f0f2f5', text_color: '#111111', hint_color: '#8a8a8e', button_color: '#ff7a1a', button_text_color: '#ffffff'};
      // Stand-in for telegram-web-app.js: same globals and CSS variables Telegram sets.
      await ctx.route('https://telegram.org/js/telegram-web-app.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body: `(() => { const v = ${JSON.stringify(vars)}; for (const k in v) document.documentElement.style.setProperty('--tg-theme-' + k.replace(/_/g, '-'), v[k]);
            window.Telegram = {WebApp: {initData: ${JSON.stringify(initData)}, colorScheme: '${theme}', themeParams: v, ready() {}, expand() {}, openLink() {}, HapticFeedback: {selectionChanged() {}}}}; })();`,
        }),
      );
      const page = await ctx.newPage();
      await page.goto('http://localhost:4319/app/', {waitUntil: 'networkidle'});
      await page.waitForSelector('.stats');
      await page.waitForTimeout(600);
      const shot = async (name: string) => {
        const f = path.join(OUT, `dashboard-${theme}-${name}.png`);
        await page.screenshot({path: f, fullPage: true});
        files.push(f);
      };
      await shot('1-overview');
      if (theme === 'dark') {
        await page.click('[role=tab]:has-text("Library")');
        await page.selectOption('select', 'views');
        await page.waitForTimeout(400);
        await shot('2-library');
        await page.click('[role=tab]:has-text("Insights")');
        await page.waitForTimeout(400);
        await shot('3-insights');
        await page.click('[role=tab]:has-text("Overview")');
        await page.click('.seg button:has-text("7D")');
        await page.waitForTimeout(800);
        await shot('4-overview-7-days');
      }
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return files;
}

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  if (process.argv.includes('--dashboard-only')) {
    // Just the Mini App screenshots, with frames from the website's sample render as thumbnails.
    const media = path.join(ROOT, 'public/media');
    const thumbs = fs.existsSync(media) ? fs.readdirSync(media).filter((f) => /^scene-\d+\.jpg$/.test(f)).map((f) => fs.readFileSync(path.join(media, f))) : [];
    const browser = await chromium.launch({executablePath: BROWSER});
    try {
      log('screenshots:\n' + (await dashboardScreenshots(browser, thumbs)).map((f) => '  ' + f).join('\n'));
    } finally {
      await browser.close();
    }
    return;
  }
  log(FAST ? 'fast mode: no real renders' : 'rendering for real (a few minutes)');
  const {chat, marks, dryDir} = await runChat();
  fs.writeFileSync(path.join(OUT, 'chat-transcript.json'), JSON.stringify(chat.map(({media, ...m}) => ({...m, media: media?.map((x) => (x.startsWith('data:') ? 'data:…' : path.basename(x)))})), null, 1));

  // Thumbnails for the dashboard: frames from the real test video, if we have one.
  const thumbs: Buffer[] = [];
  const mp4 = path.join(dryDir, 'video.mp4');
  if (fs.existsSync(mp4) && fs.statSync(mp4).size > 1000) {
    for (const [i, s] of [1.6, 9, 17, 26, 34, 42, 50, 57].entries()) {
      const f = path.join(WORK, `thumb${i}.jpg`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(s), '-i', mp4, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=270:-2', f]);
      thumbs.push(fs.readFileSync(f));
    }
    fs.copyFileSync(mp4, path.join(OUT, 'test-video.mp4'));
  }
  for (const f of fs.readdirSync(dryDir)) if (/^cand\d\.png$/.test(f)) fs.copyFileSync(path.join(dryDir, f), path.join(OUT, f));
  for (const j of fs.readdirSync(WORK)) {
    const d = path.join(WORK, j);
    if (fs.statSync(d).isDirectory()) for (const f of fs.readdirSync(d)) if (/^cand\d\.png$/.test(f)) fs.copyFileSync(path.join(d, f), path.join(OUT, `character-${f}`));
  }

  const browser = await chromium.launch({executablePath: BROWSER});
  try {
    const a = await chatScreenshots(chat, marks, dryDir, browser);
    const b = await dashboardScreenshots(browser, thumbs);
    log('screenshots:\n' + [...a, ...b].map((f) => '  ' + f).join('\n'));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
