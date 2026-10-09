/**
 * Sends a ready-made mp4 to the owner's Telegram as a normal approval message
 * (privacy buttons, Post / Skip), like the worker does after a render. Tapping Post then
 * goes through the real publishing flow.
 *   tsx studio/dev/send-video.ts <file.mp4> [caption file]
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {creatorInfo} from '../../src/tiktok.js';
import {K} from '../bot/keyboards.js';
import {T} from '../bot/texts.js';
import {ownerId} from '../lib/env.js';
import {fmtLocal} from '../lib/schedule.js';
import {SupabaseStore} from '../lib/supabase-store.js';
import {telegram} from '../lib/telegram.js';
import {accessTokenFor} from '../lib/tiktok.js';

const [file, captionFile] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) throw new Error('usage: send-video.ts <file.mp4> [caption file]');
const caption = captionFile && fs.existsSync(captionFile) ? fs.readFileSync(captionFile, 'utf8').trim() : '';
const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

const store = new SupabaseStore();
const userId = ownerId();
if (!(await store.getTikTok(userId))) throw new Error('the owner has not connected TikTok');
const settings = await store.getSettings(userId);

const {token, row} = await accessTokenFor(store, userId, {force: true});
const info = await creatorInfo(token);
if (info.max_video_post_duration_sec < seconds) throw new Error(`TikTok allows only ${info.max_video_post_duration_sec} s videos on this account`);
const username = info.creator_username || row.username || '';

const now = new Date();
const v = await store.insertVideo({user_id: userId, slot_at: now.toISOString(), status: 'rendering', caption, duration_s: Math.ceil(seconds), plan: {}});
const videoPath = `videos/${userId}/${v.id}.mp4`;
await store.upload(videoPath, fs.readFileSync(file), 'video/mp4');
await store.updateVideo(v.id, {status: 'awaiting_approval', video_path: videoPath, privacy_options: info.privacy_level_options, privacy: null});
const sent = await telegram.video(userId, file, T.approval(fmtLocal(now, settings?.timezone ?? 'UTC'), caption, username, false), K.approval(v.id, info.privacy_level_options, null));
await store.updateVideo(v.id, {approval_msg_id: sent.messageId, ...(sent.fileId ? {plan: {tg_file_id: sent.fileId}} : {})});
console.log(`Sent video ${v.id} to the owner (@${username}), ${Math.ceil(seconds)} s`);
