import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {FakeTikTok} from '../studio/dev/fake-tiktok';
import {claudeAccessProblem, plainReason} from '../studio/lib/reasons';
import {chunkPlan, publishVideo} from '../src/publish';

const MB = 1024 * 1024;
let fake: FakeTikTok | null = null;
afterEach(() => {
  fake?.uninstall();
  fake = null;
});

function videoFile(bytes: number) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pip-pub-test-')), 'video.mp4');
  fs.writeFileSync(f, Buffer.alloc(bytes, 1));
  return f;
}

describe('TikTok upload', () => {
  it('follows TikTok’s chunk rules for every size', () => {
    expect(chunkPlan(3 * MB)).toEqual({chunkSize: 3 * MB, count: 1});
    // 5-10 MB files used to be sent as one "10 MB chunk", which gives TikTok a count of 0.
    expect(chunkPlan(7 * MB)).toEqual({chunkSize: 7 * MB, count: 1});
    expect(chunkPlan(64 * MB)).toEqual({chunkSize: 64 * MB, count: 1});
    expect(chunkPlan(95 * MB)).toEqual({chunkSize: 10 * MB, count: 9});
    for (const size of [1, 4.9 * MB, 5 * MB, 7.3 * MB, 12 * MB, 64 * MB + 1, 130 * MB]) {
      const p = chunkPlan(Math.round(size));
      expect(p.count).toBe(Math.floor(Math.round(size) / p.chunkSize));
    }
  });

  it('posts a 7 MB video', async () => {
    fake = new FakeTikTok({privacyOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']});
    fake.install();
    const r = await publishVideo(videoFile(7 * MB), 'caption', 'act.token', {privacy: 'PUBLIC_TO_EVERYONE', durationSec: 30, mode: 'direct'});
    expect(r.status).toBe('PUBLISH_COMPLETE');
    expect(r.privacy).toBe('PUBLIC_TO_EVERYONE');
  });

  it('posts as "Only me" when TikTok has not approved the app yet', async () => {
    fake = new FakeTikTok({privacyOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], unaudited: true});
    fake.install();
    const r = await publishVideo(videoFile(2 * MB), 'caption', 'act.token', {privacy: 'PUBLIC_TO_EVERYONE', durationSec: 30, mode: 'direct'});
    expect(r.privacy).toBe('SELF_ONLY');
    expect(fake.posts[0].privacy).toBe('SELF_ONLY');
  });

  it('tells the user to make a public account private when TikTok has not approved the app', async () => {
    fake = new FakeTikTok({privacyOptions: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], unaudited: true, publicAccount: true});
    fake.install();
    const err = await publishVideo(videoFile(2 * MB), 'caption', 'act.token', {privacy: 'PUBLIC_TO_EVERYONE', durationSec: 30, mode: 'direct'}).catch((e) => (e as Error).message);
    expect(err).toMatch(/unaudited_client_can_only_post_to_private_accounts/);
    expect(plainReason(err as string)).toMatch(/turn on Private account, then tap Retry/);
  });

  it('tells the user what TikTok said', () => {
    expect(plainReason('TikTok post init: spam_risk_too_many_posts too many (log_id x)')).toMatch(/posted too many times today/);
    expect(plainReason('TikTok publish failed: file_format_check_failed')).toMatch(/could not read the video file/);
    expect(plainReason('TikTok post init: some_new_code oops')).toBe('TikTok refused the upload. (TikTok said: some_new_code) I will try again if you tap Retry.');
    expect(plainReason('TikTok chunk 1 upload: HTTP 400 bad')).toMatch(/^TikTok refused the upload/);
    expect(plainReason('TikTok post init: HTTP 401 access_token_invalid')).toMatch(/Connect TikTok again/);
    expect(claudeAccessProblem('TikTok post init: HTTP 401 access_token_invalid')).toBe(false);
  });

  it('explains a Claude login that Anthropic turned off', () => {
    const err = 'Claude Code error: Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable it';
    expect(plainReason(err)).toMatch(/personal Pro or Max plan, or with an API key/);
    expect(claudeAccessProblem(err)).toBe(true);
  });
});
