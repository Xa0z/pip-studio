/**
 * Worker entry point for GitHub Actions.
 *   tsx studio/worker/cli.ts tick
 *   tsx studio/worker/cli.ts loop [minutes]        (a tick every 5 minutes for that long; GitHub's schedule runs hours late)
 *   tsx studio/worker/cli.ts job prepare <jobId>   (secrets + database)
 *   tsx studio/worker/cli.ts job render <jobId>    (NO secrets, NO database: runs Claude-written character code)
 *   tsx studio/worker/cli.ts job finish <jobId>    (secrets + database)
 *   tsx studio/worker/cli.ts fail <jobId> [reason]
 *   tsx studio/worker/cli.ts needs-cli <jobId>     (prints true when the job uses the owner's Claude Code token)
 */
import fs from 'node:fs';
import path from 'node:path';
import {viaClaudeCode} from '../../src/plan.js';
import {MINUTES_LIMIT, ownerId} from '../lib/env.js';
import {githubDispatch} from '../lib/github.js';
import {guardConsole, redact} from '../lib/redact.js';
import {SupabaseStore} from '../lib/supabase-store.js';
import {telegram} from '../lib/telegram.js';
import {realRenderer, type WorkerCtx} from './context.js';
import {fail, finish, prepare, render} from './jobs.js';
import {claudeAsk} from './planner.js';
import {actionsMinutesFromGitHub, tick} from './tick.js';

guardConsole();

const workDir = path.resolve(process.env.STUDIO_WORK_DIR || 'work');

const unavailable = (what: string) => () => {
  throw new Error(`${what} is not available in this step`);
};

function realCtx(): WorkerCtx {
  return {
    store: new SupabaseStore(),
    msg: telegram,
    dispatch: githubDispatch,
    ask: claudeAsk,
    claudeCode: (token, prompt) => viaClaudeCode(prompt, 'You are a helpful assistant.', token),
    render: realRenderer,
    workDir,
    ownerId: ownerId(),
    minutesLimit: MINUTES_LIMIT(),
    now: () => new Date(),
  };
}

/** Public repos get Actions minutes for free, so the minutes limit only applies to private ones. */
async function tickCtx(): Promise<WorkerCtx> {
  const ctx = realCtx();
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !process.env.GITHUB_TOKEN || ctx.minutesLimit <= 0) return ctx;
  const res = await fetch(`https://api.github.com/repos/${repo}`, {headers: {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json'}}).catch(() => null);
  const info = res?.ok ? ((await res.json()) as {private?: boolean}) : null;
  return info && info.private === false ? {...ctx, minutesLimit: 0} : ctx;
}

/** The render step gets a context with no store, no messenger and no Claude: it only reads work/<job>/state.json. */
function renderCtx(): WorkerCtx {
  const nothing = new Proxy({}, {get: (_t, p) => unavailable(`store.${String(p)}`)});
  return {
    store: nothing as WorkerCtx['store'],
    msg: nothing as WorkerCtx['msg'],
    dispatch: unavailable('dispatch') as WorkerCtx['dispatch'],
    ask: unavailable('Claude') as WorkerCtx['ask'],
    claudeCode: unavailable('Claude Code') as WorkerCtx['claudeCode'],
    render: realRenderer,
    workDir,
    ownerId: 0,
    minutesLimit: 0,
    now: () => new Date(),
  };
}

async function main() {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  if (cmd === 'tick') {
    const report = await tick(await tickCtx(), {actionsMinutes: () => actionsMinutesFromGitHub()});
    console.log('tick', JSON.stringify(report));
    return;
  }
  if (cmd === 'loop') {
    const until = Date.now() + Number(a || 50) * 60000;
    const every = Number(process.env.TICK_EVERY_MS || 5 * 60000);
    const ctx = await tickCtx();
    for (;;) {
      const started = Date.now();
      try {
        const report = await tick(ctx, {actionsMinutes: () => actionsMinutesFromGitHub()});
        console.log(new Date().toISOString(), 'tick', JSON.stringify(report));
      } catch (e) {
        console.error('tick failed:', redact((e as Error).message));
      }
      const next = started + every;
      if (next >= until) return;
      await new Promise((r) => setTimeout(r, Math.max(0, next - Date.now())));
    }
  }
  if (cmd === 'job') {
    if (!b) throw new Error('usage: job prepare|render|finish <jobId>');
    if (a === 'prepare') return prepare(realCtx(), b);
    if (a === 'render') return render(renderCtx(), b);
    if (a === 'finish') return finish(realCtx(), b);
    throw new Error(`unknown job phase ${a}`);
  }
  if (cmd === 'fail') {
    if (!a) throw new Error('usage: fail <jobId> [reason]');
    const errFile = path.join(workDir, a, 'error.txt');
    const reason = [b, ...rest].join(' ').trim() || (fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8') : undefined);
    return fail(realCtx(), a, reason);
  }
  if (cmd === 'needs-cli') {
    const store = new SupabaseStore();
    const job = await store.getJob(a);
    const cred = job?.user_id ? await store.getClaude(job.user_id) : null;
    console.log(cred?.kind === 'oauth_token' ? 'true' : 'false');
    return;
  }
  throw new Error(`unknown command ${cmd ?? ''}`);
}

main().catch((e) => {
  const msg = redact((e as Error).stack ?? String(e));
  console.error(msg);
  // The fail step reads this so the user gets a plain reason.
  const jobId = process.argv[2] === 'job' ? process.argv[4] : undefined;
  if (jobId) {
    try {
      fs.mkdirSync(path.join(workDir, jobId), {recursive: true});
      fs.writeFileSync(path.join(workDir, jobId, 'error.txt'), redact((e as Error).message ?? String(e)).slice(0, 500));
    } catch {
      /* ignore */
    }
  }
  process.exit(1);
});
