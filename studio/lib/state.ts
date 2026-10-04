/** Signed OAuth "state": carries the Telegram user id, expires after 10 minutes. */
import crypto from 'node:crypto';
import {hmacHex, safeEqual} from './crypto.js';

export const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(telegramId: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({u: telegramId, e: now + STATE_TTL_MS, n: crypto.randomBytes(6).toString('hex')})).toString('base64url');
  return `${body}.${hmacHex('oauth-state', body).slice(0, 32)}`;
}

export type StateCheck = {ok: true; telegramId: number} | {ok: false; reason: 'bad' | 'expired'};

export function verifyState(state: string, now = Date.now()): StateCheck {
  const [body, sig] = String(state ?? '').split('.');
  if (!body || !sig || !safeEqual(sig, hmacHex('oauth-state', body).slice(0, 32))) return {ok: false, reason: 'bad'};
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.u !== 'number' || typeof p.e !== 'number') return {ok: false, reason: 'bad'};
    if (now > p.e) return {ok: false, reason: 'expired'};
    return {ok: true, telegramId: p.u};
  } catch {
    return {ok: false, reason: 'bad'};
  }
}
