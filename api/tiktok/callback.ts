// TikTok Login Kit redirect URI: https://<your-app>.vercel.app/api/tiktok/callback
import {Api} from 'grammy';
import {need} from '../../studio/lib/env.js';
import {getStore} from '../../studio/server/deps.js';
import {tiktokCallback} from '../../studio/server/handlers.js';

export function GET(req: Request) {
  return tiktokCallback(req, getStore(), new Api(need('TELEGRAM_BOT_TOKEN')));
}
