import {log} from './log.js';

/** Sends a Telegram message. Never throws: an alert failing must not hide the real error. */
export async function notify(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    log.warn('Telegram not set up (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), alert only in logs');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true}),
    });
    if (!res.ok) log.warn(`Telegram answered ${res.status}`);
    else log.info('Telegram alert sent');
  } catch (e) {
    log.warn(`Telegram failed: ${(e as Error).message}`);
  }
}

export const runUrl = () =>
  process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
