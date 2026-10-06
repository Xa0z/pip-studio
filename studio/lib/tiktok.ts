/** TikTok Login Kit (web), Display API and token handling for many users. Never logs tokens. */
import {tiktokJson} from '../../src/tiktok.js';
import {aadFor, decryptSecret, encryptSecret} from './crypto.js';
import {baseUrl, need} from './env.js';
import {addSecret} from './redact.js';
import type {Store} from './store.js';
import type {TikTokRow} from './types.js';

export const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list', 'video.publish'];
export const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const redirectUri = () => `${baseUrl()}/api/tiktok/callback`;

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({client_key: need('TIKTOK_CLIENT_KEY'), response_type: 'code', scope: SCOPES.join(','), redirect_uri: redirectUri(), state});
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = {open_id: string; access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; scope: string};

export const exchangeCode = (code: string) =>
  tiktokJson<TokenResponse>('token exchange', '/v2/oauth/token/', {
    form: {client_key: need('TIKTOK_CLIENT_KEY'), client_secret: need('TIKTOK_CLIENT_SECRET'), code, grant_type: 'authorization_code', redirect_uri: redirectUri()},
  });

const refreshCall = (refreshToken: string) =>
  tiktokJson<TokenResponse>('token refresh', '/v2/oauth/token/', {
    form: {client_key: need('TIKTOK_CLIENT_KEY'), client_secret: need('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: refreshToken},
  });

export const revokeToken = (accessToken: string) =>
  tiktokJson('revoke', '/v2/oauth/revoke/', {form: {client_key: need('TIKTOK_CLIENT_KEY'), client_secret: need('TIKTOK_CLIENT_SECRET'), token: accessToken}}).catch(() => undefined);

export type TikTokUser = {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

export const USER_FIELDS = 'open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count';

export async function fetchUser(token: string): Promise<TikTokUser> {
  const r = await tiktokJson<{user: TikTokUser}>('user info', `/v2/user/info/?fields=${USER_FIELDS}`, {token, method: 'GET'});
  return r.user;
}

export type TikTokVideo = {
  id: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  title?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
};
const VIDEO_FIELDS = 'id,create_time,cover_image_url,share_url,video_description,title,duration,view_count,like_count,comment_count,share_count';

/** Up to `pages` x 20 most recent videos. */
export async function listVideos(token: string, pages = 3): Promise<TikTokVideo[]> {
  const out: TikTokVideo[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < pages; i++) {
    const r = await tiktokJson<{videos: TikTokVideo[]; cursor: number; has_more: boolean}>('video list', `/v2/video/list/?fields=${VIDEO_FIELDS}`, {
      token,
      body: {max_count: 20, ...(cursor ? {cursor} : {})},
    });
    out.push(...(r.videos ?? []));
    if (!r.has_more) break;
    cursor = r.cursor;
  }
  return out;
}

/** Current numbers for specific videos (max 20 per call). */
export async function queryVideos(token: string, ids: string[]): Promise<TikTokVideo[]> {
  const out: TikTokVideo[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = await tiktokJson<{videos: TikTokVideo[]}>('video query', `/v2/video/query/?fields=${VIDEO_FIELDS}`, {token, body: {filters: {video_ids: ids.slice(i, i + 20)}}});
    out.push(...(r.videos ?? []));
  }
  return out;
}

export function encryptTokens(userId: number, t: TokenResponse, now = Date.now()) {
  return {
    open_id: t.open_id,
    access_token_enc: encryptSecret(t.access_token, aadFor.tiktokAccess(userId)),
    refresh_token_enc: encryptSecret(t.refresh_token, aadFor.tiktokRefresh(userId)),
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + t.refresh_expires_in * 1000).toISOString(),
    scopes: t.scope.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export class TikTokReconnectNeeded extends Error {}

/**
 * A working access token for this user. Refreshes when it expires in under 10 minutes
 * (or always, with force) and saves the new encrypted tokens.
 */
export async function accessTokenFor(store: Store, userId: number, opts: {force?: boolean; now?: Date} = {}): Promise<{token: string; row: TikTokRow}> {
  const nowMs = (opts.now ?? new Date()).getTime();
  const row = await store.getTikTok(userId);
  if (!row) throw new TikTokReconnectNeeded('TikTok is not connected');
  if (new Date(row.refresh_expires_at).getTime() < nowMs) throw new TikTokReconnectNeeded('TikTok login expired');
  const fresh = new Date(row.access_expires_at).getTime() - nowMs > 10 * 60 * 1000;
  if (fresh && !opts.force) {
    const token = decryptSecret(row.access_token_enc, aadFor.tiktokAccess(userId));
    addSecret(token);
    return {token, row};
  }
  const refresh = decryptSecret(row.refresh_token_enc, aadFor.tiktokRefresh(userId));
  addSecret(refresh);
  let t: TokenResponse;
  try {
    t = await refreshCall(refresh);
  } catch (e) {
    if (/invalid_grant|refresh_token/i.test((e as Error).message)) throw new TikTokReconnectNeeded('TikTok login was revoked or expired');
    throw e;
  }
  addSecret(t.access_token);
  addSecret(t.refresh_token);
  const updated: TikTokRow = {...row, ...encryptTokens(userId, t, nowMs)};
  await store.saveTikTok(updated);
  return {token: t.access_token, row: updated};
}
