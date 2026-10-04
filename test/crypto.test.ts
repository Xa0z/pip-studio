import {describe, expect, it} from 'vitest';
import {aadFor, decryptSecret, encryptSecret, masterKey} from '../studio/lib/crypto';
import {signState, STATE_TTL_MS, verifyState} from '../studio/lib/state';
import {signInitData, verifyInitData} from '../studio/lib/initdata';
import {redact} from '../studio/lib/redact';

describe('token encryption (AES-256-GCM)', () => {
  it('round trips and never stores the plain text', () => {
    const secret = 'act.' + 'x'.repeat(60);
    const box = encryptSecret(secret, aadFor.tiktokAccess(42));
    expect(box.startsWith('v1.')).toBe(true);
    expect(box).not.toContain(secret);
    expect(decryptSecret(box, aadFor.tiktokAccess(42))).toBe(secret);
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same', 'aad')).not.toBe(encryptSecret('same', 'aad'));
  });

  it('fails for another user or another purpose (AAD)', () => {
    const box = encryptSecret('sk-ant-api03-secret', aadFor.claude(1));
    expect(() => decryptSecret(box, aadFor.claude(2))).toThrow();
    expect(() => decryptSecret(box, aadFor.tiktokAccess(1))).toThrow();
  });

  it('fails when the ciphertext is changed', () => {
    const box = encryptSecret('hello world', 'aad');
    const raw = Buffer.from(box.slice(3), 'base64url');
    raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret('v1.' + raw.toString('base64url'), 'aad')).toThrow();
  });

  it('needs a 32 byte master key', () => {
    expect(() => masterKey('abcd')).toThrow(/32 bytes/);
  });
});

describe('OAuth state', () => {
  it('carries the Telegram id and expires after 10 minutes', () => {
    const t0 = Date.UTC(2026, 9, 4, 12);
    const s = signState(777, t0);
    expect(verifyState(s, t0 + 60_000)).toEqual({ok: true, telegramId: 777});
    expect(verifyState(s, t0 + STATE_TTL_MS + 1)).toEqual({ok: false, reason: 'expired'});
  });

  it('rejects a changed state', () => {
    const s = signState(777);
    const [body, sig] = s.split('.');
    const forged = Buffer.from(JSON.stringify({u: 1, e: Date.now() + 1e6, n: 'x'})).toString('base64url');
    expect(verifyState(`${forged}.${sig}`).ok).toBe(false);
    expect(verifyState(`${body}.${'0'.repeat(32)}`).ok).toBe(false);
    expect(verifyState('').ok).toBe(false);
  });
});

describe('Telegram initData', () => {
  const token = '123456:TEST-TOKEN-not-real';
  const now = 1_790_000_000;
  const good = signInitData({auth_date: String(now - 60), user: JSON.stringify({id: 5550001, first_name: 'Ahmad'}), query_id: 'q1'}, token);

  it('accepts data signed with the bot token', () => {
    const r = verifyInitData(good, token, 86400, now);
    expect(r.ok && r.user.id).toBe(5550001);
  });

  it('rejects another bot, a changed user, or old data', () => {
    expect(verifyInitData(good, '999:OTHER', 86400, now).ok).toBe(false);
    expect(verifyInitData(good.replace('5550001', '5550002'), token, 86400, now).ok).toBe(false);
    expect(verifyInitData(good, token, 86400, now + 2 * 86400)).toEqual({ok: false, reason: 'expired'});
    expect(verifyInitData('', token).ok).toBe(false);
  });
});

describe('log redaction', () => {
  it('masks every kind of token', () => {
    const text = [
      'key sk-ant-api03-AAAAAAAAAAAAAAAAAAAA',
      'oauth sk-ant-oat01-BBBBBBBBBBBBBBBBBBBB',
      'tiktok act.CCCCCCCCCCCCCCCCCCCC rft.DDDDDDDDDDDDDDDDDDDD',
      'Authorization: Bearer EEEEEEEEEEEEEEEE',
      'https://api.telegram.org/bot123456789:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF/sendMessage',
      'ghp_GGGGGGGGGGGGGGGGGGGGGGGG',
      'callback?code=HHHHHHHH&state=ok',
    ].join('\n');
    const out = redact(text);
    for (const leak of ['AAAAAAAAAAAA', 'BBBBBBBBBBBB', 'CCCCCCCCCCCC', 'DDDDDDDDDDDD', 'EEEEEEEEEEEE', 'FFFFFFFFFFFF', 'GGGGGGGGGGGG', 'HHHHHHHH']) expect(out).not.toContain(leak);
    expect(out).toContain('state=ok');
  });

  it('masks secrets from the environment', () => {
    process.env.TIKTOK_CLIENT_SECRET = 'plain-looking-secret-value';
    expect(redact('oops plain-looking-secret-value')).toBe('oops [TIKTOK_CLIENT_SECRET]');
  });
});
