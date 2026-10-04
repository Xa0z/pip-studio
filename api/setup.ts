import {baseUrl, need} from '../studio/lib/env.js';
import {setupTelegram} from '../studio/lib/telegram-setup.js';

/**
 * Connects the bot to this deployment: webhook, commands, menu button. Safe to open again:
 * the webhook is only replaced when it points somewhere else, or with ?force=<TELEGRAM_WEBHOOK_SECRET>.
 */
export async function GET(req: Request) {
  try {
    const secret = need('TELEGRAM_WEBHOOK_SECRET');
    const force = new URL(req.url).searchParams.get('force') === secret;
    const result = await setupTelegram({token: need('TELEGRAM_BOT_TOKEN'), secret, base: baseUrl(), force});
    const ok = !Object.values(result).some((s) => s.startsWith('FAILED'));
    return Response.json({ok, webhook: `${baseUrl()}/api/telegram`, ...result}, {status: ok ? 200 : 502});
  } catch (e) {
    return Response.json({ok: false, error: e instanceof Error ? e.message : 'setup failed'}, {status: 500});
  }
}
