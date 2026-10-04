/**
 * One-time Telegram setup after deploying to Vercel:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... PUBLIC_BASE_URL=https://your-app.vercel.app npm run set-webhook
 * Or just open https://your-app.vercel.app/api/setup in a browser, which does the same from Vercel.
 */
import 'dotenv/config';
import {baseUrl, need} from '../lib/env.js';
import {setupTelegram} from '../lib/telegram-setup.js';

const result = await setupTelegram({token: need('TELEGRAM_BOT_TOKEN'), secret: need('TELEGRAM_WEBHOOK_SECRET'), base: baseUrl(), force: true});
for (const [method, status] of Object.entries(result)) console.log(`${method}: ${status}`);
if (Object.values(result).some((s) => s.startsWith('FAILED'))) process.exitCode = 1;
