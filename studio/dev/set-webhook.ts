/**
 * One-time Telegram setup after deploying to Vercel:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... PUBLIC_BASE_URL=https://your-app.vercel.app npm run set-webhook
 * Sets the webhook (with the secret), the command list and the menu button that opens the dashboard.
 */
import 'dotenv/config';
import {baseUrl, need} from '../lib/env.js';

const token = need('TELEGRAM_BOT_TOKEN');
const secret = need('TELEGRAM_WEBHOOK_SECRET');
const base = baseUrl();

async function call(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const json = (await res.json()) as {ok: boolean; description?: string};
  console.log(`${method}: ${json.ok ? 'ok' : `FAILED ${json.description}`}`);
  if (!json.ok) process.exitCode = 1;
}

await call('setWebhook', {url: `${base}/api/telegram`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true});
await call('setMyCommands', {
  commands: [
    {command: 'start', description: 'Set up or continue'},
    {command: 'stats', description: 'Today and the last 30 days'},
    {command: 'top', description: 'Best videos'},
    {command: 'report', description: 'Weekly report'},
    {command: 'dashboard', description: 'Open the dashboard'},
    {command: 'settings', description: 'Change niche, goal, schedule, mode'},
    {command: 'pause', description: 'Stop posting'},
    {command: 'resume', description: 'Start posting again'},
    {command: 'disconnect', description: 'Delete my data'},
    {command: 'help', description: 'Help'},
  ],
});
await call('setChatMenuButton', {menu_button: {type: 'web_app', text: 'Dashboard', web_app: {url: `${base}/app/`}}});
