/** Uploads one mp4 to TikTok with FILE_UPLOAD (chunked) and waits for the result. */
import fs from 'node:fs';
import {config} from './config.js';
import {log} from './log.js';
import {creatorInfo, tiktokJson} from './tiktok.js';
import {HttpError, isRetryableStatus, sleep, withRetry} from './util.js';

const MAX_SINGLE = 64 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

/**
 * TikTok rules: chunks are 5–64 MB, total_chunk_count must be floor(video_size / chunk_size), and the
 * last chunk takes the remainder. Anything up to 64 MB goes in one piece with chunk_size = video_size
 * (a 7 MB file sent as one 10 MB "chunk" gives a count of 0 and TikTok rejects it).
 */
export function chunkPlan(size: number) {
  if (size <= MAX_SINGLE) return {chunkSize: size, count: 1};
  return {chunkSize: CHUNK, count: Math.floor(size / CHUNK)};
}

export type PublishResult = {publishId: string; status: string; privacy: string; username: string; postIds: string[]};

export type PublishOptions = {
  /** Privacy the user picked. Falls back to an allowed level if TikTok does not allow it right now. */
  privacy?: string;
  /** Video length in seconds (default 62). Checked against creator_info's max. */
  durationSec?: number;
  mode?: 'direct' | 'inbox';
};

/** Picks the wanted privacy if TikTok allows it, else SELF_ONLY, else the first allowed option. */
export const choosePrivacy = (wanted: string, options: string[]) =>
  options.includes(wanted) ? wanted : options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0];

export async function publishVideo(file: string, caption: string, token: string, opts: PublishOptions = {}): Promise<PublishResult> {
  const info = await creatorInfo(token);
  const duration = opts.durationSec ?? 62;
  log.info(`Posting as @${info.creator_username}. Allowed privacy: ${info.privacy_level_options.join(', ')}. Max length ${info.max_video_post_duration_sec} s`);
  if (info.max_video_post_duration_sec < duration) {
    throw new Error(`TikTok allows only ${info.max_video_post_duration_sec} s videos for this account, ${Math.ceil(duration)} s is not allowed`);
  }

  // Only use a privacy level TikTok allows right now.
  const wanted = opts.privacy ?? config.TIKTOK_PRIVACY;
  const options = info.privacy_level_options;
  const chosen = choosePrivacy(wanted, options);
  if (chosen !== wanted) log.warn(`${wanted} is not allowed for this account (app not audited yet?), using ${chosen}`);

  const size = fs.statSync(file).size;
  const {chunkSize, count} = chunkPlan(size);
  const sourceInfo = {source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count};

  const inbox = (opts.mode ?? config.TIKTOK_POST_MODE) === 'inbox';
  let privacy = chosen;
  const initUpload = (level: string) => tiktokJson<{publish_id: string; upload_url: string}>(
    'TikTok post init',
    inbox ? '/v2/post/publish/inbox/video/init/' : '/v2/post/publish/video/init/',
    {
      token,
      body: inbox
        ? {source_info: sourceInfo}
        : {
            post_info: {
              title: caption,
              privacy_level: level,
              disable_comment: info.comment_disabled,
              disable_duet: info.duet_disabled,
              disable_stitch: info.stitch_disabled,
              video_cover_timestamp_ms: 1500,
              is_aigc: true,
              brand_content_toggle: false,
              brand_organic_toggle: false,
            },
            source_info: sourceInfo,
          },
    },
  );
  let init: {publish_id: string; upload_url: string};
  try {
    init = await initUpload(privacy);
  } catch (e) {
    // Apps TikTok has not audited yet may only post private videos: post it as "Only me" instead of failing.
    if (inbox || privacy === 'SELF_ONLY' || !/unaudited_client|privacy_level_option_mismatch/i.test((e as Error).message) || !options.includes('SELF_ONLY')) throw e;
    log.warn(`TikTok only allows private posts for this app right now (${(e as Error).message}), posting as SELF_ONLY`);
    privacy = 'SELF_ONLY';
    init = await initUpload(privacy);
  }
  log.info(`Upload started (${(size / 1024 / 1024).toFixed(1)} MB in ${count} chunk${count > 1 ? 's' : ''})`);

  const fd = fs.openSync(file, 'r');
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
      const buf = Buffer.alloc(end - start + 1);
      fs.readSync(fd, buf, 0, buf.length, start);
      await withRetry(`TikTok chunk ${i + 1}/${count}`, async () => {
        const res = await fetch(init.upload_url, {
          method: 'PUT',
          headers: {'Content-Type': 'video/mp4', 'Content-Length': String(buf.length), 'Content-Range': `bytes ${start}-${end}/${size}`},
          body: buf,
        });
        if (!(res.status === 200 || res.status === 201 || res.status === 206)) {
          throw new HttpError(`TikTok chunk ${i + 1} upload: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, res.status, isRetryableStatus(res.status));
        }
      });
      log.info(`Chunk ${i + 1}/${count} uploaded`);
    }
  } finally {
    fs.closeSync(fd);
  }

  // Poll until done (up to 10 minutes).
  const done = inbox ? 'SEND_TO_USER_INBOX' : 'PUBLISH_COMPLETE';
  let last = '';
  for (let i = 0; i < 120; i++) {
    await sleep(Number(process.env.TIKTOK_POLL_MS ?? 5000));
    const s = await tiktokJson<{status: string; fail_reason?: string; publicaly_available_post_id?: string[]}>(
      'TikTok status',
      '/v2/post/publish/status/fetch/',
      {token, body: {publish_id: init.publish_id}},
    );
    if (s.status !== last) log.info(`TikTok status: ${s.status}`);
    last = s.status;
    if (s.status === done || (inbox && s.status === 'PUBLISH_COMPLETE')) {
      return {publishId: init.publish_id, status: s.status, privacy: inbox ? 'INBOX' : privacy, username: info.creator_username, postIds: s.publicaly_available_post_id ?? []};
    }
    if (s.status === 'FAILED') throw new Error(`TikTok publish failed: ${s.fail_reason ?? 'no reason given'}`);
  }
  throw new Error(`TikTok publish did not finish in 10 minutes (last status ${last})`);
}
