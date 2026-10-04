/** Warns on Telegram when this month's GitHub Actions usage passes the limit in pip.config.json. */
import fs from 'node:fs';
import path from 'node:path';
import {config, ROOT} from './config.js';
import {log} from './log.js';
import {notify} from './notify.js';

const WARNED = path.join(ROOT, 'state', 'minutes-warned.txt');

export async function checkMonthlyMinutes() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  let minutes = 0;
  try {
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/runs?created=>=${month}-01&per_page=100&page=${page}`, {
        headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json'},
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const {workflow_runs: runs} = (await res.json()) as {workflow_runs: {run_started_at: string; updated_at: string; status: string}[]};
      for (const r of runs) {
        const end = r.status === 'completed' ? new Date(r.updated_at) : now;
        minutes += Math.ceil(Math.max(0, end.getTime() - new Date(r.run_started_at).getTime()) / 60000);
      }
      if (runs.length < 100) break;
    }
  } catch (e) {
    log.warn(`Could not read Actions usage: ${(e as Error).message}`);
    return;
  }
  log.info(`GitHub Actions usage this month: about ${minutes} minutes (warning at ${config.MONTHLY_MINUTES_WARNING})`);
  const warned = fs.existsSync(WARNED) ? fs.readFileSync(WARNED, 'utf8').trim() : '';
  if (minutes > config.MONTHLY_MINUTES_WARNING && warned !== month) {
    await notify(`⚠️ Pip Explains: GitHub Actions used about ${minutes} minutes this month (limit warning ${config.MONTHLY_MINUTES_WARNING}). Private repos get 2000 free minutes.`);
    fs.mkdirSync(path.dirname(WARNED), {recursive: true});
    fs.writeFileSync(WARNED, month + '\n');
  }
}
