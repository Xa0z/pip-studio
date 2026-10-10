/**
 * Runs the real bot and the real worker against fakes: an in-memory database, a fake Telegram API
 * (records every message), a fake TikTok API and canned Claude answers. Used by the tests and
 * by `npm run simulate`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {InputFile} from 'grammy';
import type {Update, UserFromGetMe} from 'grammy/types';
import {createBot} from '../bot/bot.js';
import {tiktokCallback} from '../server/handlers.js';
import type {CheckResult} from '../lib/claude-check.js';
import {MemoryStore, setMemoryStoreClock} from '../lib/memory-store.js';
import type {Button, Keyboard, Messenger} from '../lib/telegram.js';
import type {Renderer, WorkerCtx} from '../worker/context.js';
import {fail, finish, prepare, render} from '../worker/jobs.js';
import {tick, type TickReport} from '../worker/tick.js';
import {FakeTikTok, type FakeTikTokOptions} from './fake-tiktok.js';
import {fakeAsk} from './fixtures.js';
import {htmlToText} from '../lib/knowledge.js';

export type ChatItem = {
  id: number;
  from: 'user' | 'bot';
  kind: 'text' | 'photo' | 'video' | 'voice' | 'album' | 'press' | 'alert' | 'system';
  text?: string;
  buttons?: Keyboard;
  /** Local file paths or URLs (memory:// for files in the fake storage). */
  media?: string[];
  deleted?: boolean;
  edited?: boolean;
};

export const TEST_ENV: Record<string, string> = {
  MASTER_ENCRYPTION_KEY: 'a'.repeat(64),
  TIKTOK_CLIENT_KEY: 'fake-client-key',
  TIKTOK_CLIENT_SECRET: 'fake-client-secret',
  PUBLIC_BASE_URL: 'https://pip-studio.example.com',
  TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN-not-real',
  TTS_PROVIDER: 'fake',
  TIKTOK_POLL_MS: '1',
};

export const BOT_INFO: UserFromGetMe = {
  id: 123456,
  is_bot: true,
  first_name: 'Pip Studio',
  username: 'PipStudioBot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

/** Renders nothing: writes tiny placeholder files. Fast, for tests. */
export const fakeRenderer: Renderer = {
  video: (async ({outPath}: {outPath: string}) => {
    fs.writeFileSync(outPath, Buffer.from('fake mp4'));
  }) as unknown as Renderer['video'],
  still: (async ({outPath}: {outPath: string}) => {
    fs.writeFileSync(outPath, Buffer.from('89504e470d0a1a0a', 'hex'));
    return 'serve://fake';
  }) as unknown as Renderer['still'],
  check: (async () => undefined) as unknown as Renderer['check'],
};

export type HarnessOptions = {
  userId?: number;
  ownerId?: number;
  firstName?: string;
  username?: string;
  tiktok?: FakeTikTokOptions;
  renderer?: Renderer;
  workDir?: string;
  testApiKey?: (key: string) => Promise<CheckResult>;
  allowAutoForAll?: boolean;
  now?: () => Date;
  statsChart?: (input: import('../lib/charts.js').ChartInput) => Promise<Buffer>;
  /** Saves files the bot sends (photos as buffers) here so screenshots can show them. */
  mediaDir?: string;
  /** Stand-in for the free media library (default: finds nothing, so tests never touch the network). */
  findMedia?: import('../worker/media.js').MediaFinder;
  /** Changes every video plan the fake Claude writes (e.g. to add a media scene). */
  editPlan?: (plan: any) => any;
  /** Answer some Claude calls yourself (return undefined to use the normal fake answer). */
  answer?: (prompt: string, system: string) => string | undefined;
  /** Write generated characters into the real remotion/ folder (only for real renders). */
  realRegistry?: boolean;
};

export class Harness {
  readonly now: () => Date;
  store = new MemoryStore();
  chat: ChatItem[] = [];
  queue: string[] = [];
  /** File ids the worker downloaded from Telegram, and fake files to hand back for them. */
  downloads: string[] = [];
  refFiles = new Map<string, Buffer>();
  /** Web pages the bot can "read" for business knowledge (url -> html). */
  pages = new Map<string, string>();
  /** Every system prompt the worker sent to Claude, newest last. */
  systems: string[] = [];
  tiktok: FakeTikTok;
  bot: ReturnType<typeof createBot>;
  ctx: WorkerCtx;
  userId: number;
  private nextId = 100;
  private updateId = 1;
  private mediaDir: string;

  constructor(readonly opts: HarnessOptions = {}) {
    for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] ??= v;
    this.userId = opts.userId ?? 5550001;
    this.tiktok = new FakeTikTok({now: opts.now, ...opts.tiktok}).install();
    const workDir = opts.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pip-studio-work-'));
    this.mediaDir = opts.mediaDir ?? path.join(workDir, '_media');
    fs.mkdirSync(this.mediaDir, {recursive: true});
    if (opts.realRegistry) delete process.env.STUDIO_REGISTRY_DIR, delete process.env.STUDIO_EPISODE_DIR;
    else (process.env.STUDIO_REGISTRY_DIR = path.join(workDir, '_registry')), (process.env.STUDIO_EPISODE_DIR = path.join(workDir, '_episodes'));
    const now = opts.now ?? (() => new Date());
    this.now = now;
    setMemoryStoreClock(now);

    this.bot = createBot({
      token: process.env.TELEGRAM_BOT_TOKEN!,
      store: this.store,
      dispatch: async (jobId) => {
        this.queue.push(jobId);
      },
      ownerId: opts.ownerId ?? 0,
      baseUrl: process.env.PUBLIC_BASE_URL!,
      tiktokAuthUrl: (state) => `https://www.tiktok.com/v2/auth/authorize/?client_key=fake-client-key&state=${encodeURIComponent(state)}`,
      testApiKey: opts.testApiKey ?? (async (key) => (key.includes('bad') ? {ok: false, reason: 'This key was rejected by Anthropic.'} : {ok: true})),
      statsChart: opts.statsChart ?? (async () => Buffer.from('89504e470d0a1a0a', 'hex')),
      revokeTikTok: async () => undefined,
      botInfo: BOT_INFO,
      allowAutoForAll: opts.allowAutoForAll,
      downloadFile: async (fileId) => {
        const f = this.refFiles.get(fileId);
        if (!f) throw new Error('file not found');
        return new Uint8Array(f);
      },
      fetchPage: async (url) => {
        const html = this.pages.get(url.toString()) ?? this.pages.get(url.origin);
        if (html == null) throw new Error('the site answered 404');
        return htmlToText(html);
      },
      now,
    });
    this.bot.api.config.use(async (_prev, method, payload: any) => ({ok: true, result: this.fakeApi(method, payload)}) as any);

    const msg: Messenger = {
      text: async (_c, text, keyboard) => this.botSays({kind: 'text', text, buttons: keyboard}),
      photo: async (_c, file, caption, keyboard) => this.botSays({kind: 'photo', text: caption, buttons: keyboard, media: [this.saveMedia(file, 'png')]}),
      video: async (_c, file, caption, keyboard, thumb) => {
        const messageId = this.botSays({kind: 'video', text: caption, buttons: keyboard, media: [thumb ?? file]});
        return {messageId, fileId: `tgvid-${messageId}`};
      },
      album: async (_c, files) => {
        const id = this.botSays({kind: 'album', text: files.map((f) => f.caption ?? '').filter(Boolean).join('\n'), media: files.map((f) => this.saveMedia(f.file, 'png'))});
        return files.map((_, i) => id + i);
      },
      voice: async (_c, file, caption) => this.botSays({kind: 'voice', text: caption, media: [file]}),
      audio: async (_c, file, _title, caption) => this.botSays({kind: 'voice', text: caption, media: [file]}),
      download: async (fileId) => {
        this.downloads.push(fileId);
        return this.refFiles.get(fileId) ?? Buffer.from('not a real video');
      },
    };

    this.ctx = {
      store: this.store,
      msg,
      dispatch: async (jobId) => {
        this.queue.push(jobId);
      },
      ask: () => {
        const inner = fakeAsk(() => this.characterName());
        return (prompt, system, images) => {
          this.systems.push(system);
          const own = opts.answer?.(prompt, system);
          if (own !== undefined) return Promise.resolve(own);
          const out = inner(prompt, system, images);
          const edit = opts.editPlan;
          if (!edit) return out;
          return out.then((text) => {
            try {
              const plan = JSON.parse(text);
              return Array.isArray(plan?.scenes) ? JSON.stringify(edit(plan)) : text;
            } catch {
              return text;
            }
          });
        };
      },
      claudeCode: async () => 'OK',
      render: opts.renderer ?? fakeRenderer,
      workDir,
      ownerId: opts.ownerId ?? 0,
      minutesLimit: 1700,
      now,
      findMedia: opts.findMedia ?? (async () => null),
    };
  }

  close() {
    this.tiktok.uninstall();
  }

  private characterName() {
    return [...this.store.characters.values()].find((c) => c.user_id === this.userId && c.status === 'locked')?.name ?? null;
  }

  private saveMedia(file: string | Buffer, ext: string) {
    if (typeof file === 'string') return file;
    const p = path.join(this.mediaDir, `${crypto.randomUUID()}.${ext}`);
    fs.writeFileSync(p, file);
    return p;
  }

  private botSays(item: Omit<ChatItem, 'id' | 'from'>) {
    const id = this.nextId++;
    this.chat.push({id, from: 'bot', ...item});
    return id;
  }

  private mediaOf(x: unknown, ext: string): string {
    if (typeof x === 'string') return x;
    if (x instanceof InputFile) {
      const data = (x as any).fileData;
      if (Buffer.isBuffer(data) || data instanceof Uint8Array) return this.saveMedia(Buffer.from(data), ext);
      if (typeof data === 'string') return data;
    }
    return '(file)';
  }

  private fakeApi(method: string, p: any): unknown {
    const chat = {id: p.chat_id ?? this.userId, type: 'private', first_name: 'User'};
    const message = (id: number, text?: string) => ({message_id: id, date: Math.floor(Date.now() / 1000), chat, text});
    const buttons = (): Keyboard | undefined => p.reply_markup?.inline_keyboard as Button[][] | undefined;
    switch (method) {
      case 'sendMessage':
        return message(this.botSays({kind: 'text', text: p.text, buttons: buttons()}), p.text);
      case 'sendPhoto':
        return message(this.botSays({kind: 'photo', text: p.caption, buttons: buttons(), media: [this.mediaOf(p.photo, 'png')]}));
      case 'sendVideo': {
        const id = this.botSays({kind: 'video', text: p.caption, buttons: buttons(), media: [this.mediaOf(p.video, 'mp4')]});
        return {...message(id), video: {file_id: `tgvid-${id}`, file_unique_id: `u-${id}`, width: 1080, height: 1920, duration: 30}};
      }
      case 'sendVoice':
        return message(this.botSays({kind: 'voice', text: p.caption, media: [this.mediaOf(p.voice, 'ogg')]}));
      case 'sendMediaGroup': {
        const id = this.botSays({kind: 'album', media: (p.media as any[]).map((m) => this.mediaOf(m.media, 'png'))});
        return (p.media as any[]).map((_, i) => message(id + i));
      }
      case 'editMessageText': {
        const m = this.chat.find((x) => x.id === p.message_id);
        if (m) Object.assign(m, {text: p.text, buttons: buttons(), edited: true});
        return message(p.message_id, p.text);
      }
      case 'editMessageReplyMarkup': {
        const m = this.chat.find((x) => x.id === p.message_id);
        if (m) m.buttons = buttons()?.length ? buttons() : undefined;
        return message(p.message_id);
      }
      case 'deleteMessage': {
        const m = this.chat.find((x) => x.id === p.message_id);
        if (m) m.deleted = true;
        return true;
      }
      case 'answerCallbackQuery':
        if (p.text && p.show_alert) this.botSays({kind: 'alert', text: p.text});
        return true;
      default:
        return true;
    }
  }

  private from() {
    return {id: this.userId, is_bot: false, first_name: this.opts.firstName ?? 'Ahmad', username: this.opts.username ?? 'ahmad'};
  }

  /** The user types a message (commands start with /). */
  async say(text: string) {
    const id = this.nextId++;
    this.chat.push({id, from: 'user', kind: 'text', text});
    const entities = text.startsWith('/') ? [{type: 'bot_command' as const, offset: 0, length: text.split(' ')[0].length}] : undefined;
    const update = {
      update_id: this.updateId++,
      message: {message_id: id, date: Math.floor(Date.now() / 1000), chat: {id: this.userId, type: 'private', first_name: 'User'}, from: this.from(), text, ...(entities ? {entities} : {})},
    } as unknown as Update;
    await this.bot.handleUpdate(update);
    return id;
  }

  /** The user sends a video (e.g. a reference for marketing mode). */
  async sendVideo(fileId: string, opts: {duration?: number; file_size?: number; asDocument?: boolean; caption?: string} = {}) {
    const id = this.nextId++;
    this.chat.push({id, from: 'user', kind: 'video', text: opts.caption ?? `(video ${fileId})`});
    const media = {file_id: fileId, file_unique_id: `u-${fileId}`, duration: opts.duration ?? 20, width: 1080, height: 1920, file_size: opts.file_size ?? 5_000_000, mime_type: 'video/mp4'};
    const update = {
      update_id: this.updateId++,
      message: {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        chat: {id: this.userId, type: 'private', first_name: 'User'},
        from: this.from(),
        ...(opts.asDocument ? {document: {...media, file_name: `${fileId}.mp4`}} : {video: media}),
        ...(opts.caption ? {caption: opts.caption} : {}),
      },
    } as unknown as Update;
    await this.bot.handleUpdate(update);
    return id;
  }

  /** The user sends a file (a PDF, a price list...). Its bytes come from `refFiles`. */
  async sendDocument(fileId: string, fileName: string, mime: string, bytes?: Buffer) {
    if (bytes) this.refFiles.set(fileId, bytes);
    const id = this.nextId++;
    this.chat.push({id, from: 'user', kind: 'text', text: `(file ${fileName})`});
    const update = {
      update_id: this.updateId++,
      message: {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        chat: {id: this.userId, type: 'private', first_name: 'User'},
        from: this.from(),
        document: {file_id: fileId, file_unique_id: `u-${fileId}`, file_name: fileName, mime_type: mime, file_size: bytes?.length ?? this.refFiles.get(fileId)?.length ?? 100},
      },
    } as unknown as Update;
    await this.bot.handleUpdate(update);
    return id;
  }

  /** The user sends a photo (e.g. their logo). Telegram sends a few sizes; we give two. */
  async sendPhoto(fileId: string, bytes: Buffer, width = 400, height = 400) {
    this.refFiles.set(fileId, bytes);
    const id = this.nextId++;
    this.chat.push({id, from: 'user', kind: 'photo', text: `(photo ${fileId})`});
    const update = {
      update_id: this.updateId++,
      message: {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        chat: {id: this.userId, type: 'private', first_name: 'User'},
        from: this.from(),
        photo: [
          {file_id: `${fileId}-thumb`, file_unique_id: `u-${fileId}-t`, width: 90, height: 90},
          {file_id: fileId, file_unique_id: `u-${fileId}`, width, height, file_size: bytes.length},
        ],
      },
    } as unknown as Update;
    await this.bot.handleUpdate(update);
    return id;
  }

  /** Finds the newest bot message with a button for this callback data. */
  findButton(data: string | RegExp) {
    const match = (b: Button) => (typeof data === 'string' ? b.callback_data === data : !!b.callback_data && data.test(b.callback_data));
    for (let i = this.chat.length - 1; i >= 0; i--) {
      const m = this.chat[i];
      const b = m.buttons?.flat().find(match);
      if (b) return {message: m, button: b};
    }
    return null;
  }

  /** The user taps an inline button. */
  async press(data: string | RegExp) {
    const found = this.findButton(data);
    if (!found) throw new Error(`No button ${String(data)} in the chat. Last bot message: ${this.lastBot()?.text?.slice(0, 200)}`);
    this.chat.push({id: this.nextId++, from: 'user', kind: 'press', text: found.button.text});
    const update = {
      update_id: this.updateId++,
      callback_query: {
        id: String(this.updateId),
        from: this.from(),
        chat_instance: '1',
        data: found.button.callback_data,
        message: {message_id: found.message.id, date: Math.floor(Date.now() / 1000), chat: {id: this.userId, type: 'private', first_name: 'User'}, text: found.message.text ?? ''},
      },
    } as unknown as Update;
    await this.bot.handleUpdate(update);
  }

  /** Completes TikTok login in the "browser": follows the Connect button's URL back to our callback. */
  async tiktokLogin(code = 'good-code') {
    const found = this.chat.flatMap((m) => m.buttons?.flat() ?? []).reverse().find((b) => b.url?.includes('tiktok.com/v2/auth'));
    if (!found?.url) throw new Error('No Connect TikTok button');
    const state = new URL(found.url).searchParams.get('state')!;
    this.chat.push({id: this.nextId++, from: 'user', kind: 'system', text: 'Logs in on TikTok and taps Authorize'});
    const res = await tiktokCallback(new Request(`${process.env.PUBLIC_BASE_URL}/api/tiktok/callback?code=${code}&state=${encodeURIComponent(state)}&scopes=all`), this.store, this.bot.api, this.now);
    return {status: res.status, html: await res.text()};
  }

  /** Runs queued GitHub jobs the way the workflow does: prepare -> render -> finish (fail on error). */
  async runJobs(max = 20) {
    const done: {id: string; ok: boolean; error?: string}[] = [];
    for (let i = 0; i < max && this.queue.length; i++) {
      const id = this.queue.shift()!;
      try {
        await prepare(this.ctx, id);
        await render(this.ctx, id);
        await finish(this.ctx, id);
        done.push({id, ok: true});
      } catch (e) {
        if (process.env.HARNESS_DEBUG) console.error('job failed:', e);
        await fail(this.ctx, id, (e as Error).message);
        done.push({id, ok: false, error: (e as Error).message});
      }
    }
    return done;
  }

  async tick(): Promise<TickReport> {
    return tick(this.ctx, {actionsMinutes: async () => null});
  }

  lastBot(kind?: ChatItem['kind']) {
    return [...this.chat].reverse().find((m) => m.from === 'bot' && (!kind || m.kind === kind));
  }

  botTexts() {
    return this.chat.filter((m) => m.from === 'bot').map((m) => m.text ?? '');
  }

  user() {
    return this.store.getUser(this.userId);
  }
}

export type OnboardChoices = {
  claudeSecret?: string;
  niches?: string[];
  goal?: 'followers' | 'views' | 'creator_rewards' | 'traffic';
  character?: string | null;
  pick?: 1 | 2 | 3;
  /** A preset id, or custom colours typed as "#bg #accent" (theme wins). */
  preset?: string;
  theme?: string;
  timezone?: number;
  postsPerDay?: 1 | 2 | 3;
  mode?: 'approval' | 'auto';
};

/** The whole /start flow with sensible answers. Stops after the preview video. */
export async function runOnboarding(h: Harness, c: OnboardChoices = {}) {
  await h.say('/start');
  await h.press('ob:go');
  await h.tiktokLogin();
  await h.press('ob:next');
  await h.say(c.claudeSecret ?? 'sk-ant-oat01-' + 'x'.repeat(80));
  await h.runJobs();
  for (const n of c.niches ?? ['science', 'history']) await h.press(`n:${n}`);
  await h.press('n:done');
  await h.press(`g:${c.goal ?? 'creator_rewards'}`);
  if (c.character === null) {
    await h.press('ch:no');
    await h.runJobs();
  } else {
    await h.press('ch:yes');
    await h.say(c.character ?? 'a friendly orange fox who loves space');
    await h.runJobs();
    await h.press(`ch:pick:${c.pick ?? 1}`);
  }
  await h.press(/^v:/);
  if (c.theme) {
    await h.press('th:custom');
    await h.say(c.theme);
  } else {
    await h.press(`th:${c.preset ?? 'sage'}`);
  }
  await h.press(`tz:${c.timezone ?? 0}`);
  await h.press(`ppd:${c.postsPerDay ?? 2}`);
  await h.press('tm:ok');
  await h.press(`m:${c.mode ?? 'approval'}`);
  await h.press('sum:start');
  return h.runJobs();
}
