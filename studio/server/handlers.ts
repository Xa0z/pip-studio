/** HTTP handlers (Web Request/Response), shared by Vercel functions and the local dev server. */
import {Api, webhookCallback} from 'grammy';
import {onTikTokConnected} from '../bot/bot.js';
import {buildDashboard, buildSchedule, loadAnalytics, UPCOMING_STATUSES, type Range} from '../lib/analytics.js';
import {opt} from '../lib/env.js';
import {initDataUser} from './initdata-auth.js';
import {redact} from '../lib/redact.js';
import {verifyState} from '../lib/state.js';
import type {Store} from '../lib/store.js';
import {encryptTokens, exchangeCode, fetchUser} from '../lib/tiktok.js';
import {addSecret} from '../lib/redact.js';
import type {createBot} from '../bot/bot.js';

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="icon" href="/logo.svg"><style>body{font:16px/1.6 'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#EBE5DF;color:#24272A;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}main{max-width:420px;text-align:center;background:#F7F6F2;border:1px solid #D1D5DB;border-radius:8px;padding:28px 24px}h2{margin:0 0 8px;font-size:20px}p{color:#5B6B68;margin:0}a{display:inline-block;margin-top:20px;background:#465B53;color:#F7F6F2;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600}a:focus-visible{outline:2px solid #73847C;outline-offset:2px}</style></head>
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
      ...encryptTokens(uid, t),
    });
    await store.insertAccountMetric({
      user_id: uid,
      captured_at: new Date().toISOString(),
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
  const [a, upcoming] = await Promise.all([loadAnalytics(store, user.id), store.listVideos(user.id, {status: [...UPCOMING_STATUSES]})]);
  const thumbs = new Map<string, string>();
  await Promise.all(
    a.posted.filter((v) => v.thumb_path).slice(0, 200).map(async (v) => thumbs.set(v.id, await store.signedUrl(v.thumb_path!, 3600).catch(() => ''))),
  );
  return json({...buildDashboard(a, range, now, (v) => thumbs.get(v.id) || null), schedule: buildSchedule(a.settings, upcoming, now)});
}

export function telegramWebhook(bot: ReturnType<typeof createBot>) {
  const secret = opt('TELEGRAM_WEBHOOK_SECRET');
  return webhookCallback(bot, 'std/http', secret ? {secretToken: secret} : {});
}
