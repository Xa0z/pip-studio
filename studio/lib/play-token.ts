/** Short-lived token that lets the dashboard's <video> player load the user's own videos (a video tag can't send headers). */
import {hmacHex, safeEqual} from './crypto.js';

export const PLAY_TTL_MS = 6 * 3600 * 1000;

export function signPlayToken(telegramId: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({u: telegramId, e: now + PLAY_TTL_MS})).toString('base64url');
  return `${body}.${hmacHex('video-play', body).slice(0, 32)}`;
}

export function verifyPlayToken(token: string, now = Date.now()): number | null {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig || !safeEqual(sig, hmacHex('video-play', body).slice(0, 32))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof p.u === 'number' && typeof p.e === 'number' && now <= p.e ? p.u : null;
  } catch {
    return null;
  }
}
