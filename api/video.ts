// Dashboard video player: GET /api/video?id=<videoId>&t=<playToken>
import {need} from '../studio/lib/env.js';
import {getStore} from '../studio/server/deps.js';
import {videoStream} from '../studio/server/handlers.js';

export function GET(req: Request) {
  return videoStream(req, getStore(), need('TELEGRAM_BOT_TOKEN'));
}
