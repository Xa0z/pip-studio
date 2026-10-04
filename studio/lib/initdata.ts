/**
 * Telegram Mini App initData check (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * secret = HMAC_SHA256(key "WebAppData", bot token); hash = hex(HMAC_SHA256(secret, data_check_string)).
 */
import crypto from 'node:crypto';
import {safeEqual} from './crypto.js';

export type InitUser = {id: number; first_name?: string; username?: string; language_code?: string};

export type InitCheck = {ok: true; user: InitUser; authDate: number} | {ok: false; reason: string};

export function dataCheckString(params: URLSearchParams) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString(params)).digest('hex'));
  return params.toString();
}

export function verifyInitData(initData: string, botToken: string, maxAgeSec = 24 * 3600, nowSec = Math.floor(Date.now() / 1000)): InitCheck {
  if (!initData) return {ok: false, reason: 'missing initData'};
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return {ok: false, reason: 'missing hash'};
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString(params)).digest('hex');
  if (!safeEqual(hash, expected)) return {ok: false, reason: 'bad hash'};
  const authDate = Number(params.get('auth_date'));
  if (!authDate || nowSec - authDate > maxAgeSec) return {ok: false, reason: 'expired'};
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as InitUser | null;
    if (!user || typeof user.id !== 'number') return {ok: false, reason: 'no user'};
    return {ok: true, user, authDate};
  } catch {
    return {ok: false, reason: 'bad user'};
  }
}
