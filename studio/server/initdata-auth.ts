import {verifyInitData, type InitCheck} from '../lib/initdata.js';

/** Reads Telegram initData from the X-Telegram-Init-Data header and checks its signature. */
export function initDataUser(req: Request, botToken: string): InitCheck {
  const raw = req.headers.get('x-telegram-init-data') ?? '';
  return verifyInitData(raw, botToken);
}
