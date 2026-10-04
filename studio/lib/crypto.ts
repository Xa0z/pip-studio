/**
 * AES-256-GCM for tokens and keys at rest, plus HMAC signing.
 * Format: "v1." + base64url(iv[12] | tag[16] | ciphertext).
 * The "aad" (e.g. "tiktok:12345") is bound to the ciphertext, so a value copied
 * into another user's row or column does not decrypt.
 */
import crypto from 'node:crypto';
import {need} from './env.js';

let cached: {raw: string; key: Buffer} | null = null;

export function masterKey(raw = need('MASTER_ENCRYPTION_KEY')): Buffer {
  if (cached?.raw === raw) return cached.key;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('MASTER_ENCRYPTION_KEY must be 32 bytes (64 hex characters). Make one with: npm run gen:key');
  cached = {raw, key: buf};
  return buf;
}

/** A separate key per purpose, so the encryption key is never used directly for signing. */
export const subKey = (purpose: string) => crypto.createHmac('sha256', masterKey()).update(`pip-studio:${purpose}`).digest();

export function encryptSecret(plain: string, aad: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
}

export function decryptSecret(box: string, aad: string): string {
  if (!box.startsWith('v1.')) throw new Error('Unknown secret format');
  const raw = Buffer.from(box.slice(3), 'base64url');
  if (raw.length < 29) throw new Error('Secret is too short');
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), raw.subarray(0, 12));
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

export const aadFor = {
  tiktokAccess: (uid: number) => `tiktok-access:${uid}`,
  tiktokRefresh: (uid: number) => `tiktok-refresh:${uid}`,
  claude: (uid: number) => `claude:${uid}`,
};

export const hmacHex = (purpose: string, data: string) => crypto.createHmac('sha256', subKey(purpose)).update(data).digest('hex');

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
