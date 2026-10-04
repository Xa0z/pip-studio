// Mini App data: GET /api/dashboard?range=7|30|90|all with header X-Telegram-Init-Data
import {need} from '../studio/lib/env.js';
import {getStore} from '../studio/server/deps.js';
import {dashboardApi} from '../studio/server/handlers.js';

export function GET(req: Request) {
  return dashboardApi(req, getStore(), need('TELEGRAM_BOT_TOKEN'));
}
