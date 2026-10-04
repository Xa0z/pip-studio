// Telegram webhook: https://<your-app>.vercel.app/api/telegram
import {getBot} from '../studio/server/deps.js';
import {telegramWebhook} from '../studio/server/handlers.js';

let handler: ((req: Request) => Promise<Response>) | null = null;

export async function POST(req: Request) {
  handler ??= telegramWebhook(getBot());
  return handler(req);
}

export function GET() {
  return new Response('Pip Studio bot webhook. Telegram sends POST requests here.');
}
