/** What the worker needs. Real services in GitHub Actions; fakes in tests and the local simulation. */
import type {ClaudeCredential} from '../../src/plan.js';
import {checkDuration, renderStillPng, renderVideo} from '../../src/render.js';
import type {Dispatcher} from '../lib/github.js';
import type {Store} from '../lib/store.js';
import type {Messenger} from '../lib/telegram.js';
import type {MediaFinder} from './media.js';
import type {Ask} from './planner.js';

export type Renderer = {
  video: typeof renderVideo;
  still: typeof renderStillPng;
  check: typeof checkDuration;
};

export type WorkerCtx = {
  store: Store;
  msg: Messenger;
  dispatch: Dispatcher;
  ask: (cred: ClaudeCredential) => Ask;
  /** Runs `claude -p` with the owner's token; resolves to the reply text. */
  claudeCode: (token: string, prompt: string) => Promise<string>;
  render: Renderer;
  workDir: string;
  ownerId: number;
  minutesLimit: number;
  now: () => Date;
  /** Finds and downloads library photos and clips (default: the real free libraries). */
  findMedia?: MediaFinder;
};

export const realRenderer: Renderer = {video: renderVideo, still: renderStillPng, check: checkDuration};
