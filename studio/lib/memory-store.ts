/** In-memory Store for tests and the local simulation. Mirrors the database rules that matter. */
import crypto from 'node:crypto';
import type {New, Store} from './store.js';
import {monthKey} from './store.js';
import type {
  AccountMetricRow, CharacterRow, ClaudeRow, JobRow, PatternRow, SettingsRow, TikTokRow, UsageRow, UserRow, UserStatus, VideoMetricRow, VideoRow, VideoStatus,
} from './types.js';

let clock: () => Date = () => new Date();
const now = () => clock().toISOString();
/** Tests and the simulation move time forward; rows then get the same 'now' as the worker. */
export const setMemoryStoreClock = (fn: () => Date) => {
  clock = fn;
};
const clone = <T>(x: T): T => structuredClone(x);

export class MemoryStore implements Store {
  users = new Map<number, UserRow>();
  tiktok = new Map<number, TikTokRow>();
  claude = new Map<number, ClaudeRow>();
  settings = new Map<number, SettingsRow>();
  characters = new Map<string, CharacterRow>();
  videos = new Map<string, VideoRow>();
  videoMetrics: VideoMetricRow[] = [];
  accountMetrics: AccountMetricRow[] = [];
  patterns: PatternRow[] = [];
  jobs = new Map<string, JobRow>();
  usage = new Map<string, UsageRow>();
  files = new Map<string, {data: Buffer; contentType: string}>();

  async getUser(id: number) {
    return this.users.has(id) ? clone(this.users.get(id)!) : null;
  }
  async createUser(u: Pick<UserRow, 'id' | 'tg_username' | 'first_name' | 'is_owner'>) {
    const row: UserRow = {...u, status: 'onboarding', onboarding_step: 1, onboarding_data: {}, created_at: now(), updated_at: now()};
    this.users.set(u.id, row);
    return clone(row);
  }
  async updateUser(id: number, patch: Partial<UserRow>) {
    const cur = this.users.get(id);
    if (!cur) throw new Error(`no user ${id}`);
    const row = {...cur, ...clone(patch), updated_at: now()};
    this.users.set(id, row);
    return clone(row);
  }
  async listUsers(status?: UserStatus[]) {
    return [...this.users.values()].filter((u) => !status || status.includes(u.status)).map(clone);
  }
  async deleteUserData(id: number) {
    this.users.delete(id);
    this.tiktok.delete(id);
    this.claude.delete(id);
    this.settings.delete(id);
    for (const [k, c] of this.characters) if (c.user_id === id) this.characters.delete(k);
    const vids = new Set([...this.videos.values()].filter((v) => v.user_id === id).map((v) => v.id));
    for (const v of vids) this.videos.delete(v);
    this.videoMetrics = this.videoMetrics.filter((m) => !vids.has(m.video_id));
    this.accountMetrics = this.accountMetrics.filter((m) => m.user_id !== id);
    this.patterns = this.patterns.filter((p) => p.user_id !== id);
    for (const [k, j] of this.jobs) if (j.user_id === id) this.jobs.delete(k);
  }

  async getTikTok(userId: number) {
    return this.tiktok.has(userId) ? clone(this.tiktok.get(userId)!) : null;
  }
  async getTikTokByOpenId(openId: string) {
    return clone([...this.tiktok.values()].find((t) => t.open_id === openId) ?? null);
  }
  async saveTikTok(row: New<TikTokRow, 'connected_at'>) {
    const other = [...this.tiktok.values()].find((t) => t.open_id === row.open_id && t.user_id !== row.user_id);
    if (other) throw new Error('duplicate key value violates unique constraint "tiktok_accounts_open_id_key"');
    this.tiktok.set(row.user_id, {connected_at: now(), ...clone(row)});
  }

  async getClaude(userId: number) {
    return this.claude.has(userId) ? clone(this.claude.get(userId)!) : null;
  }
  async saveClaude(row: ClaudeRow) {
    this.claude.set(row.user_id, clone(row));
  }
  async deleteClaude(userId: number) {
    this.claude.delete(userId);
  }

  async getSettings(userId: number) {
    return this.settings.has(userId) ? clone(this.settings.get(userId)!) : null;
  }
  async saveSettings(row: SettingsRow) {
    if (row.niches.length < 1 || row.niches.length > 2) throw new Error('settings: 1 or 2 niches');
    if (row.post_times.length !== row.posts_per_day) throw new Error('settings: post_times must match posts_per_day');
    this.settings.set(row.user_id, {...clone(row), updated_at: now()});
  }

  async insertCharacter(row: New<CharacterRow, 'id' | 'created_at' | 'locked_at' | 'voice_id' | 'preview_path' | 'code_sha256'>) {
    const full: CharacterRow = {id: crypto.randomUUID(), created_at: now(), locked_at: null, voice_id: null, preview_path: null, code_sha256: null, ...clone(row)};
    this.characters.set(full.id, full);
    return clone(full);
  }
  async updateCharacter(id: string, patch: Partial<CharacterRow>) {
    const cur = this.characters.get(id);
    if (!cur) throw new Error(`no character ${id}`);
    if (cur.status === 'locked') {
      for (const k of ['code', 'code_sha256', 'voice_id', 'description'] as const) {
        if (k in patch && patch[k] !== cur[k]) throw new Error(`character ${id} is locked and cannot be changed`);
      }
      if (patch.status && patch.status !== 'locked' && patch.status !== 'archived') throw new Error('a locked character can only be archived');
    }
    if (cur.status === 'archived' && patch.status && patch.status !== 'archived') throw new Error('an archived character stays archived');
    if (patch.status === 'locked' && [...this.characters.values()].some((c) => c.user_id === cur.user_id && c.status === 'locked' && c.id !== id)) {
      throw new Error('duplicate key value violates unique constraint "one_locked_character"');
    }
    const row = {...cur, ...clone(patch)};
    this.characters.set(id, row);
    return clone(row);
  }
  async getCharacter(id: string) {
    return this.characters.has(id) ? clone(this.characters.get(id)!) : null;
  }
  async listCharacters(userId: number) {
    return [...this.characters.values()].filter((c) => c.user_id === userId).sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.version ?? 0) - (b.version ?? 0)).map(clone);
  }
  async getLockedCharacter(userId: number) {
    return clone([...this.characters.values()].find((c) => c.user_id === userId && c.status === 'locked') ?? null);
  }

  async insertVideo(row: Partial<VideoRow> & Pick<VideoRow, 'user_id' | 'slot_at'>) {
    const full: VideoRow = {
      id: crypto.randomUUID(), character_id: null, status: 'planned', is_dry_run: false, is_experiment: false, plan: null, features: null, caption: null,
      duration_s: null, video_path: null, thumb_path: null, privacy_options: null, privacy: null, tiktok_publish_id: null, tiktok_video_id: null,
      share_url: null, approval_msg_id: null, posted_at: null, attempts: 0, error: null, created_at: now(), ...clone(row),
    };
    const clash = [...this.videos.values()].find(
      (v) => !full.is_dry_run && !v.is_dry_run && v.user_id === full.user_id && v.slot_at === full.slot_at && !['failed', 'skipped'].includes(v.status),
    );
    if (clash) throw new Error('duplicate key value violates unique constraint "videos_one_per_slot"');
    this.videos.set(full.id, full);
    return clone(full);
  }
  async updateVideo(id: string, patch: Partial<VideoRow>) {
    const cur = this.videos.get(id);
    if (!cur) throw new Error(`no video ${id}`);
    const row = {...cur, ...clone(patch), updated_at: now()};
    this.videos.set(id, row);
    return clone(row);
  }
  async getVideo(id: string) {
    return this.videos.has(id) ? clone(this.videos.get(id)!) : null;
  }
  async listVideos(userId: number, opts: {status?: VideoStatus[]; includeDryRun?: boolean; limit?: number} = {}) {
    return [...this.videos.values()]
      .filter((v) => v.user_id === userId && (opts.includeDryRun || !v.is_dry_run) && (!opts.status || opts.status.includes(v.status)))
      .sort((a, b) => b.slot_at.localeCompare(a.slot_at))
      .slice(0, opts.limit ?? 10000)
      .map(clone);
  }
  async videosByStatus(status: VideoStatus[]) {
    return [...this.videos.values()].filter((v) => status.includes(v.status)).map(clone);
  }
  async postedSince(since: string) {
    return [...this.videos.values()].filter((v) => v.status === 'posted' && v.posted_at && v.posted_at >= since).map(clone);
  }

  async insertVideoMetric(row: VideoMetricRow) {
    if (this.videoMetrics.some((m) => m.video_id === row.video_id && m.checkpoint === row.checkpoint)) return;
    this.videoMetrics.push({id: this.videoMetrics.length + 1, ...clone(row)});
  }
  async listVideoMetrics(videoIds: string[]) {
    const ids = new Set(videoIds);
    return this.videoMetrics.filter((m) => ids.has(m.video_id)).map(clone);
  }
  async insertAccountMetric(row: AccountMetricRow) {
    this.accountMetrics.push({id: this.accountMetrics.length + 1, ...clone(row)});
  }
  async listAccountMetrics(userId: number, since?: string) {
    return this.accountMetrics.filter((m) => m.user_id === userId && (!since || m.captured_at >= since)).sort((a, b) => a.captured_at.localeCompare(b.captured_at)).map(clone);
  }

  async savePattern(row: New<PatternRow, 'id' | 'created_at'>) {
    this.patterns = this.patterns.map((p) => (p.user_id === row.user_id ? {...p, active: false} : p)).filter((p) => !(p.user_id === row.user_id && p.week_start === row.week_start));
    const full: PatternRow = {id: crypto.randomUUID(), created_at: now(), ...clone(row)};
    this.patterns.push(full);
    return clone(full);
  }
  async latestPattern(userId: number) {
    const mine = this.patterns.filter((p) => p.user_id === userId && p.active);
    return clone(mine.sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null);
  }

  async insertJob(row: Partial<JobRow> & Pick<JobRow, 'kind'>) {
    const full: JobRow = {
      id: crypto.randomUUID(), user_id: null, video_id: null, status: 'queued', input: {}, result: null, gh_run_id: null, attempts: 0, log: null,
      minutes_used: null, created_at: now(), started_at: null, finished_at: null, ...clone(row),
    };
    this.jobs.set(full.id, full);
    return clone(full);
  }
  async updateJob(id: string, patch: Partial<JobRow>) {
    const cur = this.jobs.get(id);
    if (!cur) throw new Error(`no job ${id}`);
    const row = {...cur, ...clone(patch)};
    this.jobs.set(id, row);
    return clone(row);
  }
  async getJob(id: string) {
    return this.jobs.has(id) ? clone(this.jobs.get(id)!) : null;
  }
  async listJobs(opts: {status?: JobRow['status'][]; userId?: number; kind?: JobRow['kind'][]}) {
    return [...this.jobs.values()]
      .filter((j) => (!opts.status || opts.status.includes(j.status)) && (opts.userId === undefined || j.user_id === opts.userId) && (!opts.kind || opts.kind.includes(j.kind)))
      .map(clone);
  }

  async addActionsMinutes(minutes: number) {
    const m = monthKey();
    const cur = this.usage.get(m) ?? {month: m, actions_minutes: 0, warned_at: null, paused_at: null};
    cur.actions_minutes += minutes;
    this.usage.set(m, cur);
    return cur.actions_minutes;
  }
  async getUsage(month: string) {
    return clone(this.usage.get(month) ?? null);
  }
  async updateUsage(month: string, patch: Partial<UsageRow>) {
    const cur = this.usage.get(month) ?? {month, actions_minutes: 0, warned_at: null, paused_at: null};
    this.usage.set(month, {...cur, ...patch});
  }

  async upload(path: string, data: Buffer | Uint8Array, contentType: string) {
    this.files.set(path, {data: Buffer.from(data), contentType});
  }
  async download(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`no file ${path}`);
    return f.data;
  }
  async signedUrl(path: string) {
    if (!this.files.has(path)) throw new Error(`Object not found: ${path}`); // like Supabase
    return `memory://${path}`;
  }
  async removeFiles(paths: string[]) {
    for (const p of paths) this.files.delete(p);
  }
  async listFiles(prefix: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}
