/** HTTP handlers (Web Request/Response), shared by Vercel functions and the local dev server. */
import {Api, BotError, webhookCallback} from 'grammy';
import {onTikTokConnected} from '../bot/bot.js';
import {buildDashboard, buildSchedule, buildUnposted, loadAnalytics, UNPOSTED_STATUSES, UPCOMING_STATUSES, type Range} from '../lib/analytics.js';
import {opt} from '../lib/env.js';
import {initDataUser} from './initdata-auth.js';
import {redact} from '../lib/redact.js';
import {verifyState} from '../lib/state.js';
import type {Store} from '../lib/store.js';
import {encryptTokens, exchangeCode, fetchUser} from '../lib/tiktok.js';
import {addSecret} from '../lib/redact.js';
import type {createBot} from '../bot/bot.js';
import {sendVideoCard} from '../bot/show-video.js';
import {signPlayToken, verifyPlayToken} from '../lib/play-token.js';
import type {VideoRow} from '../lib/types.js';

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="icon" href="/logo.svg"><style>body{font:16px/1.6 'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#000000;color:#FFFFFF;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}main{max-width:420px;text-align:center;background:#0E0E0E;border:1px solid #2A2A2A;border-radius:8px;padding:28px 24px}h2{margin:0 0 8px;font-size:20px}p{color:#A8A8A8;margin:0}a{display:inline-block;margin-top:20px;background:#A8D8FF;color:#000000;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600}a:focus-visible{outline:2px solid #A8D8FF;outline-offset:2px}</style></head>
<body><main>${body}</main></body></html>`,
    {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}},
  );

const backLink = () => {
  const name = opt('BOT_USERNAME');
  return name ? `<a href="https://t.me/${name}">Back to Telegram</a>` : '';
};

export async function tiktokCallback(req: Request, store: Store, api: Api, now: () => Date = () => new Date()): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams;
  const state = verifyState(q.get('state') ?? '', now().getTime());
  if (!state.ok) {
    return page('Link expired', `<h2>This link ${state.reason === 'expired' ? 'expired' : 'is not valid'}</h2><p>Go back to Telegram and tap <b>Connect TikTok</b> again.</p>${backLink()}`, 400);
  }
  const uid = state.telegramId;
  if (q.get('error')) {
    await api.sendMessage(uid, `⚠️ TikTok login was cancelled (${redact(q.get('error_description') ?? q.get('error') ?? '')}). Tap /start to try again.`).catch(() => undefined);
    return page('Cancelled', `<h2>Login cancelled</h2><p>No problem. Go back to Telegram to try again.</p>${backLink()}`, 400);
  }
  const code = q.get('code');
  if (!code) return page('Missing code', '<h2>Something went wrong</h2><p>TikTok did not send a login code.</p>', 400);
  try {
    const user = await store.getUser(uid);
    if (!user) return page('Unknown user', '<h2>Start the bot first</h2><p>Send /start to the bot in Telegram.</p>', 400);
    const t = await exchangeCode(code);
    addSecret(t.access_token);
    addSecret(t.refresh_token);
    const missing = ['video.publish', 'user.info.basic'].filter((s) => !t.scope.split(',').includes(s));
    if (missing.length) {
      await api.sendMessage(uid, `⚠️ TikTok didn't give permission for: ${missing.join(', ')}. Tap /start and allow all permissions.`);
      return page('Missing permissions', `<h2>Missing permissions</h2><p>Please allow all permissions when you log in.</p>${backLink()}`, 400);
    }
    const me = await fetchUser(t.access_token);
    const other = await store.getTikTokByOpenId(t.open_id);
    if (other && other.user_id !== uid) {
      await api.sendMessage(uid, '⚠️ That TikTok account is already connected to another Telegram user. Log in with a different TikTok account.');
      return page('Already connected', `<h2>Already connected</h2><p>This TikTok account is used by another Telegram user.</p>${backLink()}`, 409);
    }
    await store.saveTikTok({
      user_id: uid,
      username: me.username ?? null,
      display_name: me.display_name ?? null,
      avatar_url: me.avatar_url ?? null,
      ...encryptTokens(uid, t, now().getTime()),
    });
    await store.insertAccountMetric({
      user_id: uid,
      captured_at: now().toISOString(),
      followers: me.follower_count ?? 0,
      following: me.following_count ?? 0,
      likes: me.likes_count ?? 0,
      video_count: me.video_count ?? 0,
    });
    await onTikTokConnected(api, store, uid, me);
    return page('Connected', `<h2>Connected as @${(me.username ?? '').replace(/[<>&]/g, '')}</h2><p>You can close this page and go back to Telegram.</p>${backLink()}`);
  } catch (e) {
    console.error('TikTok callback failed:', redact((e as Error).message));
    await api.sendMessage(uid, '⚠️ Connecting TikTok failed. Tap /start and try again.').catch(() => undefined);
    return page('Error', `<h2>Something went wrong</h2><p>Go back to Telegram and try again.</p>${backLink()}`, 500);
  }
}

export async function dashboardApi(req: Request, store: Store, botToken: string, now = new Date()): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  const auth = initDataUser(req, botToken);
  if (!auth.ok) return json({error: auth.reason}, 401);
  const user = await store.getUser(auth.user.id);
  if (!user || user.onboarding_step < 7) return json({error: 'Finish setup in the bot first'}, 404);
  const r = new URL(req.url).searchParams.get('range') ?? '30';
  const range: Range = r === 'all' ? 'all' : ([7, 30, 90].includes(Number(r)) ? (Number(r) as Range) : 30);
  const [a, upcoming, notPosted] = await Promise.all([
    loadAnalytics(store, user.id),
    store.listVideos(user.id, {status: [...UPCOMING_STATUSES]}),
    store.listVideos(user.id, {status: [...UNPOSTED_STATUSES], includeDryRun: true, limit: 120}),
  ]);
  const thumbs = new Map<string, string>();
  await Promise.all(
    [...a.posted.slice(0, 200), ...notPosted]
      .filter((v) => v.thumb_path)
      .map(async (v) => thumbs.set(v.id, await store.signedUrl(v.thumb_path!, 3600).catch(() => ''))),
  );
  const thumb = (v: VideoRow) => thumbs.get(v.id) || null;
  return json({...buildDashboard(a, range, now, thumb), schedule: buildSchedule(a.settings, upcoming, now), unposted: buildUnposted(notPosted, thumb), playToken: signPlayToken(user.id, now.getTime())});
}

/** Largest piece of a video sent per request (Vercel caps response bodies; the player asks for the next piece itself). */
const PLAY_CHUNK = 3 * 1024 * 1024;
const tgPaths = new Map<string, {path: string; at: number}>();

/**
 * GET /api/video?id=<videoId>&t=<playToken>: plays one of the user's videos in the dashboard.
 * From storage while the file is there (redirect to a signed URL), else streamed from Telegram's copy
 * in range pieces, so the bot token never reaches the browser.
 */
export async function videoStream(req: Request, store: Store, botToken: string, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const uid = verifyPlayToken(url.searchParams.get('t') ?? '', now);
  if (!uid) return new Response('Open the video from the dashboard again.', {status: 401});
  const id = url.searchParams.get('id') ?? '';
  const v = /^[0-9a-f-]{36}$/.test(id) ? await store.getVideo(id) : null;
  if (!v || v.user_id !== uid) return new Response('Video not found', {status: 404});
  if (v.video_path) {
    const signed = await store.signedUrl(v.video_path, 3600).catch(() => null);
    if (signed) return new Response(null, {status: 302, headers: {Location: signed, 'Cache-Control': 'no-store'}});
  }
  const fileId: string | undefined = v.plan?.tg_file_id;
  if (!fileId) return new Response('This video is no longer stored', {status: 410});
  let cached = tgPaths.get(fileId);
  if (!cached || now - cached.at > 50 * 60000) {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`).then((x) => x.json()).catch(() => null);
    if (!r?.ok || !r.result?.file_path) return new Response('Telegram could not find this video', {status: 410});
    cached = {path: r.result.file_path, at: now};
    tgPaths.set(fileId, cached);
  }
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${cached.path}`;
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') ?? '');
  const start = m ? Number(m[1]) : 0;
  const askedEnd = m && m[2] ? Number(m[2]) : Infinity;
  const end = Math.min(askedEnd, start + PLAY_CHUNK - 1);
  const up = await fetch(fileUrl, {headers: {Range: `bytes=${start}-${end}`}}).catch(() => null);
  if (!up || (up.status !== 206 && up.status !== 200)) return new Response('Could not load the video', {status: 502});
  const upRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(up.headers.get('content-range') ?? '');
  if (up.status === 206 && upRange && up.body) {
    // Pass Telegram's bytes straight through, so the first frame shows before the whole piece has arrived.
    const [from, size] = [Number(upRange[1]), Number(upRange[3])];
    const to = Math.min(Number(upRange[2]), size - 1);
    return new Response(up.body, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${from}-${to}/${size}`,
        'Content-Length': String(to - from + 1),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }
  let body = new Uint8Array(await up.arrayBuffer());
  let total = Number(/\/(\d+)$/.exec(up.headers.get('content-range') ?? '')?.[1] ?? NaN);
  if (up.status === 200) {
    // Telegram ignored the range: cut the piece ourselves.
    total = body.length;
    body = body.slice(start, Math.min(end + 1, total));
  }
  if (!Number.isFinite(total)) total = start + body.length;
  const last = start + body.length - 1;
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${last}/${total}`,
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

/** POST /api/dashboard {send: videoId}: the bot sends that video to the user's chat (for videos that are not on TikTok). */
export async function dashboardSend(req: Request, store: Store, botToken: string, api: Api = new Api(botToken)): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  const auth = initDataUser(req, botToken);
  if (!auth.ok) return json({error: auth.reason}, 401);
  const body = (await req.json().catch(() => ({}))) as {send?: unknown};
  const id = typeof body.send === 'string' ? body.send : '';
  const v = /^[0-9a-f-]{36}$/.test(id) ? await store.getVideo(id) : null;
  if (!v || v.user_id !== auth.user.id) return json({error: 'Video not found'}, 404);
  try {
    const sent = await sendVideoCard(api, auth.user.id, store, v);
    return json({ok: true, sent});
  } catch {
    return json({error: 'Could not send it to the chat. Try /videos in the bot.'}, 502);
  }
}

export function telegramWebhook(bot: ReturnType<typeof createBot>) {
  const secret = opt('TELEGRAM_WEBHOOK_SECRET');
  // grammY gives up after 10 s by default and answers 500, so Telegram sends the same update again
  // (double jobs, double replies). Vercel allows 30 s; on a timeout answer 200 instead of a retry.
  const handle = webhookCallback(bot, 'std/http', {timeoutMilliseconds: 25_000, onTimeout: 'return', ...(secret ? {secretToken: secret} : {})});
  return async (req: Request): Promise<Response> => {
    try {
      return await handle(req);
    } catch (e) {
      // On webhooks grammY rethrows handler errors instead of calling bot.catch. Run it here and answer 200,
      // so the user gets a message and Telegram does not resend the same update over and over.
      if (e instanceof BotError) {
        await bot.errorHandler(e);
        return new Response('ok');
      }
      console.error('Webhook failed:', redact(e instanceof Error ? e.message : String(e)));
      return new Response('error', {status: 500});
    }
  };
}
