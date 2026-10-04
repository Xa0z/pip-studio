/** Small TikTok Open API client with retries and clear errors. Never logs tokens. */
import {HttpError, isRetryableStatus, withRetry} from './util.js';

export const API = 'https://open.tiktokapis.com';

type TikTokError = {code?: string; message?: string; log_id?: string};

const RETRY_CODES = new Set(['rate_limit_exceeded', 'internal_error', 'spam_risk_too_many_pending_share']);

export async function tiktokJson<T = any>(
  label: string,
  pathname: string,
  opts: {method?: string; token?: string; body?: unknown; form?: Record<string, string>} = {},
): Promise<T> {
  return withRetry(label, async () => {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(opts.form).toString();
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=UTF-8';
      body = JSON.stringify(opts.body);
    }
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const res = await fetch(API + pathname, {method: opts.method ?? 'POST', headers, body});
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new HttpError(`${label}: HTTP ${res.status}, not JSON`, res.status, isRetryableStatus(res.status));
    }
    // OAuth endpoint errors are flat ({error, error_description}); API errors are {error: {code, message}}.
    const err: TikTokError | undefined = typeof json.error === 'object' ? json.error : json.error ? {code: json.error, message: json.error_description} : undefined;
    if (!res.ok || (err?.code && err.code !== 'ok')) {
      const code = err?.code ?? String(res.status);
      throw new HttpError(
        `${label}: ${code} ${err?.message ?? ''}${err?.log_id ? ` (log_id ${err.log_id})` : ''}`.trim(),
        res.status,
        isRetryableStatus(res.status) || RETRY_CODES.has(code),
      );
    }
    return (json.data ?? json) as T;
  });
}

export type CreatorInfo = {
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

export const creatorInfo = (token: string) =>
  tiktokJson<CreatorInfo>('creator_info', '/v2/post/publish/creator_info/query/', {token, body: {}});

export const userInfo = (token: string) =>
  tiktokJson<{user: {open_id: string; display_name: string}}>('user info', '/v2/user/info/?fields=open_id,display_name', {
    token,
    method: 'GET',
  });
