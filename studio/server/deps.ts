/** Builds the bot and API dependencies from environment variables (Vercel). */
import {createBot} from '../bot/bot.js';
import {baseUrl, need, opt, ownerId} from '../lib/env.js';
import {githubDispatch, githubTickNow} from '../lib/github.js';
import type {Store} from '../lib/store.js';
import {SupabaseStore} from '../lib/supabase-store.js';
import {accessTokenFor, authorizeUrl, revokeToken} from '../lib/tiktok.js';

let store: Store | null = null;
export const getStore = () => (store ??= new SupabaseStore());

let bot: ReturnType<typeof createBot> | null = null;
export function getBot() {
  if (bot) return bot;
  const s = getStore();
  bot = createBot({
    token: need('TELEGRAM_BOT_TOKEN'),
    store: s,
    dispatch: githubDispatch,
    tickNow: githubTickNow,
    ownerId: ownerId(),
    baseUrl: baseUrl(),
    tiktokAuthUrl: authorizeUrl,
    allowAutoForAll: opt('ALLOW_AUTO_FOR_ALL') === 'true',
    revokeTikTok: async (uid) => {
      const {token} = await accessTokenFor(s, uid);
      await revokeToken(token);
    },
    // Saves a getMe call on every cold start when set (JSON from https://api.telegram.org/bot<token>/getMe).
    ...(process.env.BOT_INFO ? {botInfo: JSON.parse(process.env.BOT_INFO)} : {}),
  });
  return bot;
}
