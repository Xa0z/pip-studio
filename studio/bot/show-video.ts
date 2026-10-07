/** Shows one of the user's videos in the chat: used by "My videos" in the bot and by the dashboard Library. */
import {InputFile, type Api} from 'grammy';
import {claudeAccessProblem, plainReason} from '../lib/reasons.js';
import {fmtLocal, localParts} from '../lib/schedule.js';
import type {Store} from '../lib/store.js';
import type {Keyboard} from '../lib/telegram.js';
import type {VideoRow} from '../lib/types.js';
import {K} from './keyboards.js';
import {T} from './texts.js';

export const STATUS_LABEL: Record<string, string> = {
  planned: '🗓 Planned',
  rendering: '⏳ Being made',
  awaiting_approval: '✋ Waiting for your OK',
  approved: '⏰ Ready to post',
  publishing: '📤 Posting',
  posted: '✅ Posted',
  skipped: '⏭ Not posted (skipped)',
  failed: '⚠️ Did not post',
};
export const STATUS_ICON: Record<string, string> = {planned: '🗓', rendering: '⏳', awaiting_approval: '✋', approved: '⏰', publishing: '📤', posted: '✅', skipped: '⏭', failed: '⚠️'};

/** The topic, else the caption's first line. A video that never got a script (it failed first) says so. */
export const videoTitle = (v: VideoRow) =>
  String(v.plan?.topic || (v.caption ?? '').split('\n')[0] || '').trim() || (v.status === 'failed' ? 'Not made (no script)' : v.is_dry_run ? 'Test video' : 'Untitled video');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = (at: Date, tz: string) => {
  const p = localParts(at, tz);
  return `${p.d} ${MONTHS[p.m]}`;
};

const kb = (k: Keyboard) => (k.length ? {reply_markup: {inline_keyboard: k as any}} : {});

/**
 * Sends the video (or, when its file is gone, its thumbnail) with its status and the buttons that
 * fit: approve while it waits, retry when it failed, open on TikTok once posted.
 */
export async function sendVideoCard(api: Api, chatId: number, store: Store, v: VideoRow): Promise<'video' | 'photo' | 'text' | 'not_made'> {
  const s = await store.getSettings(v.user_id);
  const tz = s?.timezone ?? 'UTC';
  const slot = new Date(v.slot_at);
  if (['planned', 'rendering'].includes(v.status) && !v.video_path) {
    await api.sendMessage(chatId, T.videoNotMade(`${shortDay(slot, tz)}, ${fmtLocal(slot, tz)}`), {parse_mode: 'HTML'});
    return 'not_made';
  }
  let views: number | null = null;
  if (v.status === 'posted') {
    const m = await store.listVideoMetrics([v.id]).catch(() => []);
    if (m.length) views = Math.max(...m.map((x) => x.views));
  }
  const when = v.posted_at
    ? `Posted ${shortDay(new Date(v.posted_at), tz)}, ${fmtLocal(new Date(v.posted_at), tz)}`
    : v.is_dry_run
      ? `Test video from ${shortDay(new Date(v.created_at), tz)} (never posted)`
      : `For ${shortDay(slot, tz)}, ${fmtLocal(slot, tz)}`;
  const status = v.is_dry_run ? '🧪 Test video' : STATUS_LABEL[v.status] ?? v.status;
  const caption = T.videoCard({status, title: videoTitle(v), when, views, error: v.status === 'failed' && v.error ? `Why: ${plainReason(v.error)}` : null});
  const keyboard: Keyboard =
    v.status === 'awaiting_approval' ? K.approval(v.id, v.privacy_options ?? [], v.privacy) : v.status === 'failed' ? [...(v.error && claudeAccessProblem(v.error) ? K.claudeAgain() : []), ...(v.is_dry_run ? [] : K.retry(`retry:${v.id}`))] : K.openTikTok(v.share_url);
  const extra = {caption, parse_mode: 'HTML' as const, supports_streaming: true, ...kb(keyboard)};

  const fileId: string | undefined = v.plan?.tg_file_id;
  if (fileId && (await api.sendVideo(chatId, fileId, extra).then(() => true, () => false))) return 'video';
  if (v.video_path) {
    // First time this video is shown in the chat (or the old id stopped working): send the file and keep Telegram's id.
    const sent = await api
      .sendVideo(chatId, await store.signedUrl(v.video_path, 900), extra)
      .catch(async () => api.sendVideo(chatId, new InputFile(await store.download(v.video_path!), 'video.mp4'), extra))
      .catch(() => null);
    if (sent) {
      if (sent.video?.file_id) await store.updateVideo(v.id, {plan: {...(v.plan ?? {}), tg_file_id: sent.video.file_id}});
      return 'video';
    }
  }
  if (v.thumb_path) {
    const ok = await api
      .sendPhoto(chatId, await store.signedUrl(v.thumb_path, 900), {caption, parse_mode: 'HTML', ...kb(keyboard)})
      .then(() => true, () => false);
    if (ok) return 'photo';
  }
  await api.sendMessage(chatId, `${caption}\n\n${T.videoGone()}`, {parse_mode: 'HTML', ...kb(keyboard)});
  return 'text';
}
