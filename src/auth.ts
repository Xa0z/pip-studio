/**
 * TikTok OAuth.
 *   npm run tiktok:login   one-time login in your browser, saves encrypted tokens
 *   npm run tiktok:check   refreshes the token and shows what TikTok allows for your account
 * Tokens live encrypted (AES-256-GCM) in state/tiktok-tokens.enc. Nothing secret is printed.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline/promises';
import {config, ROOT} from './config.js';
import {decrypt, encrypt} from './crypto.js';
import {log} from './log.js';
import {creatorInfo, tiktokJson, userInfo} from './tiktok.js';
import {env} from './util.js';

export const TOKENS_PATH = path.join(ROOT, 'state', 'tiktok-tokens.enc');
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const DEFAULT_REDIRECT = 'http://localhost:3455/callback/';

const scopes = () => ['user.info.basic', 'video.publish', ...(config.TIKTOK_POST_MODE === 'inbox' ? ['video.upload'] : [])].join(',');

type Tokens = {
  open_id: string;
  access_token: string;
  refresh_token: string;
  scope: string;
  access_expires_at: string; // ISO
  refresh_expires_at: string; // ISO
};

type TokenResponse = {
  open_id: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
};

const toTokens = (r: TokenResponse): Tokens => ({
  open_id: r.open_id,
  access_token: r.access_token,
  refresh_token: r.refresh_token,
  scope: r.scope,
  access_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
  refresh_expires_at: new Date(Date.now() + r.refresh_expires_in * 1000).toISOString(),
});

export const saveTokens = (t: Tokens) => {
  fs.mkdirSync(path.dirname(TOKENS_PATH), {recursive: true});
  fs.writeFileSync(TOKENS_PATH, encrypt(JSON.stringify(t)));
};

const loadTokens = (): Tokens => {
  if (!fs.existsSync(TOKENS_PATH)) throw new Error('Not logged in to TikTok: state/tiktok-tokens.enc is missing. Run npm run tiktok:login and commit that file.');
  return JSON.parse(decrypt(fs.readFileSync(TOKENS_PATH, 'utf8')));
};

/** Always refreshes (TikTok access tokens last 24 h) and saves the new refresh token. */
export async function getAccessToken(): Promise<string> {
  const old = loadTokens();
  if (new Date(old.refresh_expires_at) < new Date()) throw new Error('TikTok refresh token expired. Run npm run tiktok:login again.');
  const r = await tiktokJson<TokenResponse>('token refresh', '/v2/oauth/token/', {
    form: {
      client_key: env('TIKTOK_CLIENT_KEY'),
      client_secret: env('TIKTOK_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: old.refresh_token,
    },
  });
  const t = toTokens(r);
  saveTokens(t);
  const days = Math.round((new Date(t.refresh_expires_at).getTime() - Date.now()) / 86400000);
  log.ok(`TikTok token refreshed (access valid 24 h, login valid ${days} more days)`);
  return t.access_token;
}

// ---------- login ----------

async function login() {
  const clientKey = env('TIKTOK_CLIENT_KEY');
  const clientSecret = env('TIKTOK_CLIENT_SECRET');
  env('TOKEN_ENCRYPTION_KEY'); // fail early if missing
  const redirect = process.env.TIKTOK_REDIRECT_URI?.trim() || DEFAULT_REDIRECT;
  const webFlow = redirect.startsWith('https://');
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(48).toString('base64url');
  // TikTok's Desktop flow expects code_challenge = hex(SHA256(verifier)) with method S256.
  const challenge = crypto.createHash('sha256').update(verifier).digest('hex');

  const params = new URLSearchParams({client_key: clientKey, response_type: 'code', scope: scopes(), redirect_uri: redirect, state});
  if (!webFlow) {
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  }
  const url = `${AUTH_URL}?${params}`;

  let code: string;
  if (webFlow) {
    console.log(`\nOpen this link, log in, then copy the code shown on the page:\n\n${url}\n`);
    await import('open').then((m) => m.default(url)).catch(() => undefined);
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    const pasted = (await rl.question('Paste the code here: ')).trim();
    const pastedState = (await rl.question('Paste the state here: ')).trim();
    rl.close();
    if (pastedState !== state) throw new Error('State does not match. Start the login again.');
    code = decodeURIComponent(pasted);
  } else {
    code = await new Promise<string>((resolve, reject) => {
      const u = new URL(redirect);
      const server = http.createServer((req, res) => {
        const q = new URL(req.url ?? '/', redirect).searchParams;
        if (!q.get('code') && !q.get('error')) {
          res.writeHead(404).end();
          return;
        }
        const good = q.get('code') && q.get('state') === state;
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(good ? '<h2>Pip is connected. You can close this tab.</h2>' : '<h2>Login failed. Check the terminal.</h2>');
        server.close();
        if (q.get('error')) reject(new Error(`TikTok refused: ${q.get('error')} ${q.get('error_description') ?? ''}`));
        else if (q.get('state') !== state) reject(new Error('State does not match. Start the login again.'));
        else resolve(q.get('code')!);
      });
      server.listen(Number(u.port || 80), u.hostname, async () => {
        console.log(`\nOpening TikTok login in your browser. If it does not open, paste this link:\n\n${url}\n`);
        await import('open').then((m) => m.default(url)).catch(() => undefined);
      });
      setTimeout(() => {
        server.close();
        reject(new Error('No answer from TikTok after 5 minutes'));
      }, 5 * 60 * 1000).unref(); // unref: a finished login must not keep the process alive for 5 minutes
    });
  }

  const form: Record<string, string> = {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirect,
  };
  if (!webFlow) form.code_verifier = verifier;
  const r = await tiktokJson<TokenResponse>('token exchange', '/v2/oauth/token/', {form});
  saveTokens(toTokens(r));
  const me = await userInfo(r.access_token);
  console.log(`\nLogged in as ${me.user.display_name}`);
  console.log(`Scopes: ${r.scope}`);
  console.log('Saved encrypted to state/tiktok-tokens.enc. Commit and push that file so GitHub Actions can post.');
}

async function check() {
  const token = await getAccessToken();
  const info = await creatorInfo(token);
  const ok = info.max_video_post_duration_sec >= 62;
  console.log(`\nUsername:          @${info.creator_username} (${info.creator_nickname})`);
  console.log(`Allowed privacy:   ${info.privacy_level_options.join(', ')}`);
  console.log(`Max video length:  ${info.max_video_post_duration_sec} s ${ok ? '(62 s is allowed ✔)' : '(62 s is NOT allowed ✖)'}`);
  console.log(`Comments/duet/stitch disabled: ${info.comment_disabled}/${info.duet_disabled}/${info.stitch_disabled}`);
  if (!info.privacy_level_options.includes('PUBLIC_TO_EVERYONE')) {
    console.log('\nNote: public posting is not allowed yet. Until TikTok audits your app, posts are private (SELF_ONLY).');
  }
  console.log('\nThe token file was refreshed. Commit state/tiktok-tokens.enc if you ran this locally.');
  if (!ok) process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const cmd = process.argv[2];
  (cmd === 'login' ? login() : cmd === 'check' ? check() : Promise.reject(new Error('Use: tsx src/auth.ts login|check'))).catch((e) => {
    log.error((e as Error).message);
    process.exit(1);
  });
}
