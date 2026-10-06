/** Small Telegram Bot API client for the worker (the bot itself uses grammY). */
import fs from 'node:fs';
import path from 'node:path';
import {need} from './env.js';
import {redact} from './redact.js';

export type Button = {text: string; callback_data?: string; url?: string; web_app?: {url: string}};
export type Keyboard = Button[][];

export interface Messenger {
  text(chatId: number, text: string, keyboard?: Keyboard): Promise<number>;
  photo(chatId: number, file: string | Buffer, caption?: string, keyboard?: Keyboard): Promise<number>;
  video(chatId: number, file: string, caption?: string, keyboard?: Keyboard, thumb?: string): Promise<number>;
  album(chatId: number, files: {file: string | Buffer; caption?: string}[]): Promise<number[]>;
  voice(chatId: number, file: string, caption?: string): Promise<number>;
  audio(chatId: number, file: string, title: string, caption?: string): Promise<number>;
  /** Downloads a file a user sent (by Telegram file id). Bots can only fetch files up to 20 MB. */
  download(fileId: string): Promise<Buffer>;
}

const markup = (k?: Keyboard) => (k ? JSON.stringify({inline_keyboard: k}) : undefined);

async function call(method: string, body: FormData | Record<string, unknown>): Promise<any> {
  const url = `https://api.telegram.org/bot${need('TELEGRAM_BOT_TOKEN')}/${method}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, body instanceof FormData ? {method: 'POST', body} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const json: any = await res.json().catch(() => ({ok: false, description: `HTTP ${res.status}`}));
    if (json.ok) return json.result;
    const wait = json.parameters?.retry_after;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, (wait ?? 2 ** attempt) * 1000));
      continue;
    }
    throw new Error(redact(`Telegram ${method}: ${json.description ?? res.status}`));
  }
}

const fileBlob = (file: string | Buffer, name: string) => {
  const data = typeof file === 'string' ? fs.readFileSync(file) : file;
  return {blob: new Blob([new Uint8Array(data)]), name: typeof file === 'string' ? path.basename(file) : name};
};

export const telegram: Messenger = {
  async text(chatId, text, keyboard) {
    const r = await call('sendMessage', {chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard ? {inline_keyboard: keyboard} : undefined});
    return r.message_id;
  },
  async photo(chatId, file, caption, keyboard) {
    const f = new FormData();
    const b = fileBlob(file, 'image.png');
    f.set('chat_id', String(chatId));
    f.set('photo', b.blob, b.name);
    if (caption) f.set('caption', caption), f.set('parse_mode', 'HTML');
    if (keyboard) f.set('reply_markup', markup(keyboard)!);
    return (await call('sendPhoto', f)).message_id;
  },
  async video(chatId, file, caption, keyboard, thumb) {
    const f = new FormData();
    const b = fileBlob(file, 'video.mp4');
    f.set('chat_id', String(chatId));
    f.set('video', b.blob, b.name);
    f.set('supports_streaming', 'true');
    f.set('width', '1080');
    f.set('height', '1920');
    if (thumb) {
      const t = fileBlob(thumb, 'thumb.jpg');
      f.set('thumbnail', t.blob, t.name);
    }
    if (caption) f.set('caption', caption), f.set('parse_mode', 'HTML');
    if (keyboard) f.set('reply_markup', markup(keyboard)!);
    return (await call('sendVideo', f)).message_id;
  },
  async album(chatId, files) {
    const f = new FormData();
    f.set('chat_id', String(chatId));
    const media = files.map((x, i) => {
      const b = fileBlob(x.file, `image${i + 1}.png`);
      f.set(`file${i}`, b.blob, b.name);
      return {type: 'photo', media: `attach://file${i}`, ...(x.caption ? {caption: x.caption} : {})};
    });
    f.set('media', JSON.stringify(media));
    const r = await call('sendMediaGroup', f);
    return r.map((m: any) => m.message_id);
  },
  async voice(chatId, file, caption) {
    const f = new FormData();
    const b = fileBlob(file, 'voice.ogg');
    f.set('chat_id', String(chatId));
    f.set('voice', b.blob, b.name);
    if (caption) f.set('caption', caption);
    return (await call('sendVoice', f)).message_id;
  },
  async audio(chatId, file, title, caption) {
    const f = new FormData();
    const b = fileBlob(file, 'audio.mp3');
    f.set('chat_id', String(chatId));
    f.set('audio', b.blob, b.name);
    f.set('title', title);
    if (caption) f.set('caption', caption);
    return (await call('sendAudio', f)).message_id;
  },
  async download(fileId) {
    const file = await call('getFile', {file_id: fileId});
    if (!file?.file_path) throw new Error('Telegram did not return a file path (the file may be over 20 MB)');
    const res = await fetch(`https://api.telegram.org/file/bot${need('TELEGRAM_BOT_TOKEN')}/${file.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
};
