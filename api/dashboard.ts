// Mini App data: GET /api/dashboard?range=7|30|90|all with header X-Telegram-Init-Data.
// POST /api/dashboard {send: videoId} asks the bot to send that video to the user's chat.
import {need} from '../studio/lib/env.js';
import {getStore} from '../studio/server/deps.js';
import {dashboardApi, dashboardSend} from '../studio/server/handlers.js';

export function GET(req: Request) {
  return dashboardApi(req, getStore(), need('TELEGRAM_BOT_TOKEN'));
}

export function POST(req: Request) {
  return dashboardSend(req, getStore(), need('TELEGRAM_BOT_TOKEN'));
}
