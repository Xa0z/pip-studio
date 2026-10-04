/** Store backed by Supabase (Postgres via PostgREST + Storage), using the service role key. */
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {need} from './env.js';
import type {New, Store} from './store.js';
import type {
  AccountMetricRow, CharacterRow, ClaudeRow, JobRow, PatternRow, SettingsRow, TikTokRow, UsageRow, UserRow, UserStatus, VideoMetricRow, VideoRow, VideoStatus,
} from './types.js';

const BUCKET = 'pip-studio';

const must = <T>(res: {data: T | null; error: {message: string} | null}, what: string): T => {
  if (res.error) throw new Error(`Database (${what}): ${res.error.message}`);
  return res.data as T;
};

export class SupabaseStore implements Store {
  db: SupabaseClient;
  constructor(url = need('SUPABASE_URL'), key = need('SUPABASE_SERVICE_ROLE_KEY')) {
    this.db = createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}});
  }

  async getUser(id: number) {
    return must(await this.db.from('users').select('*').eq('id', id).maybeSingle(), 'get user') as UserRow | null;
  }
  async createUser(u: Pick<UserRow, 'id' | 'tg_username' | 'first_name' | 'is_owner'>) {
    return must(await this.db.from('users').upsert(u, {onConflict: 'id', ignoreDuplicates: false}).select().single(), 'create user') as UserRow;
  }
  async updateUser(id: number, patch: Partial<UserRow>) {
    return must(await this.db.from('users').update(patch).eq('id', id).select().single(), 'update user') as UserRow;
  }
  async listUsers(status?: UserStatus[]) {
    let q = this.db.from('users').select('*');
    if (status) q = q.in('status', status);
    return must(await q, 'list users') as UserRow[];
  }
  async deleteUserData(id: number) {
    must(await this.db.rpc('delete_user_data', {uid: id}), 'delete user');
  }

  async getTikTok(userId: number) {
    return must(await this.db.from('tiktok_accounts').select('*').eq('user_id', userId).maybeSingle(), 'get tiktok') as TikTokRow | null;
  }
  async getTikTokByOpenId(openId: string) {
    return must(await this.db.from('tiktok_accounts').select('*').eq('open_id', openId).maybeSingle(), 'get tiktok') as TikTokRow | null;
  }
  async saveTikTok(row: New<TikTokRow, 'connected_at'>) {
    must(await this.db.from('tiktok_accounts').upsert(row, {onConflict: 'user_id'}), 'save tiktok');
  }

  async getClaude(userId: number) {
    return must(await this.db.from('claude_credentials').select('*').eq('user_id', userId).maybeSingle(), 'get claude') as ClaudeRow | null;
  }
  async saveClaude(row: ClaudeRow) {
    must(await this.db.from('claude_credentials').upsert(row, {onConflict: 'user_id'}), 'save claude');
  }
  async deleteClaude(userId: number) {
    must(await this.db.from('claude_credentials').delete().eq('user_id', userId), 'delete claude');
  }

  async getSettings(userId: number) {
    return must(await this.db.from('settings').select('*').eq('user_id', userId).maybeSingle(), 'get settings') as SettingsRow | null;
  }
  async saveSettings(row: SettingsRow) {
    const {updated_at: _u, ...rest} = row;
    must(await this.db.from('settings').upsert(rest, {onConflict: 'user_id'}), 'save settings');
  }

  async insertCharacter(row: New<CharacterRow, 'id' | 'created_at' | 'locked_at' | 'voice_id' | 'preview_path' | 'code_sha256'>) {
    return must(await this.db.from('characters').insert(row).select().single(), 'insert character') as CharacterRow;
  }
  async updateCharacter(id: string, patch: Partial<CharacterRow>) {
    return must(await this.db.from('characters').update(patch).eq('id', id).select().single(), 'update character') as CharacterRow;
  }
  async getCharacter(id: string) {
    return must(await this.db.from('characters').select('*').eq('id', id).maybeSingle(), 'get character') as CharacterRow | null;
  }
  async listCharacters(userId: number) {
    return must(await this.db.from('characters').select('*').eq('user_id', userId).order('created_at').order('version'), 'list characters') as CharacterRow[];
  }
  async getLockedCharacter(userId: number) {
    return must(await this.db.from('characters').select('*').eq('user_id', userId).eq('status', 'locked').maybeSingle(), 'locked character') as CharacterRow | null;
  }

  async insertVideo(row: Partial<VideoRow> & Pick<VideoRow, 'user_id' | 'slot_at'>) {
    return must(await this.db.from('videos').insert(row).select().single(), 'insert video') as VideoRow;
  }
  async updateVideo(id: string, patch: Partial<VideoRow>) {
    return must(await this.db.from('videos').update(patch).eq('id', id).select().single(), 'update video') as VideoRow;
  }
  async getVideo(id: string) {
    return must(await this.db.from('videos').select('*').eq('id', id).maybeSingle(), 'get video') as VideoRow | null;
  }
  async listVideos(userId: number, opts: {status?: VideoStatus[]; includeDryRun?: boolean; limit?: number} = {}) {
    let q = this.db.from('videos').select('*').eq('user_id', userId).order('slot_at', {ascending: false}).limit(opts.limit ?? 1000);
    if (!opts.includeDryRun) q = q.eq('is_dry_run', false);
    if (opts.status) q = q.in('status', opts.status);
    return must(await q, 'list videos') as VideoRow[];
  }
  async videosByStatus(status: VideoStatus[]) {
    return must(await this.db.from('videos').select('*').in('status', status).limit(1000), 'videos by status') as VideoRow[];
  }
  async postedSince(since: string) {
    return must(await this.db.from('videos').select('*').eq('status', 'posted').gte('posted_at', since).limit(5000), 'posted videos') as VideoRow[];
  }

  async insertVideoMetric(row: VideoMetricRow) {
    must(await this.db.from('video_metrics').upsert(row, {onConflict: 'video_id,checkpoint', ignoreDuplicates: true}), 'insert video metric');
  }
  async listVideoMetrics(videoIds: string[]) {
    if (!videoIds.length) return [];
    const out: VideoMetricRow[] = [];
    for (let i = 0; i < videoIds.length; i += 200) {
      out.push(...(must(await this.db.from('video_metrics').select('*').in('video_id', videoIds.slice(i, i + 200)).limit(20000), 'video metrics') as VideoMetricRow[]));
    }
    return out;
  }
  async insertAccountMetric(row: AccountMetricRow) {
    must(await this.db.from('account_metrics').insert(row), 'insert account metric');
  }
  async listAccountMetrics(userId: number, since?: string) {
    let q = this.db.from('account_metrics').select('*').eq('user_id', userId).order('captured_at').limit(20000);
    if (since) q = q.gte('captured_at', since);
    return must(await q, 'account metrics') as AccountMetricRow[];
  }

  async savePattern(row: New<PatternRow, 'id' | 'created_at'>) {
    must(await this.db.from('patterns').update({active: false}).eq('user_id', row.user_id), 'deactivate patterns');
    return must(await this.db.from('patterns').upsert(row, {onConflict: 'user_id,week_start'}).select().single(), 'save pattern') as PatternRow;
  }
  async latestPattern(userId: number) {
    return must(
      await this.db.from('patterns').select('*').eq('user_id', userId).eq('active', true).order('week_start', {ascending: false}).limit(1).maybeSingle(),
      'latest pattern',
    ) as PatternRow | null;
  }

  async insertJob(row: Partial<JobRow> & Pick<JobRow, 'kind'>) {
    return must(await this.db.from('jobs').insert(row).select().single(), 'insert job') as JobRow;
  }
  async updateJob(id: string, patch: Partial<JobRow>) {
    return must(await this.db.from('jobs').update(patch).eq('id', id).select().single(), 'update job') as JobRow;
  }
  async getJob(id: string) {
    return must(await this.db.from('jobs').select('*').eq('id', id).maybeSingle(), 'get job') as JobRow | null;
  }
  async listJobs(opts: {status?: JobRow['status'][]; userId?: number; kind?: JobRow['kind'][]}) {
    let q = this.db.from('jobs').select('*').order('created_at').limit(500);
    if (opts.status) q = q.in('status', opts.status);
    if (opts.userId !== undefined) q = q.eq('user_id', opts.userId);
    if (opts.kind) q = q.in('kind', opts.kind);
    return must(await q, 'list jobs') as JobRow[];
  }

  async addActionsMinutes(minutes: number) {
    return Number(must(await this.db.rpc('add_actions_minutes', {m: minutes}), 'add minutes'));
  }
  async getUsage(month: string) {
    return must(await this.db.from('usage_monthly').select('*').eq('month', month).maybeSingle(), 'get usage') as UsageRow | null;
  }
  async updateUsage(month: string, patch: Partial<UsageRow>) {
    must(await this.db.from('usage_monthly').upsert({month, ...patch}, {onConflict: 'month'}), 'update usage');
  }

  async upload(path: string, data: Buffer | Uint8Array, contentType: string) {
    must(await this.db.storage.from(BUCKET).upload(path, data, {contentType, upsert: true}), `upload ${path}`);
  }
  async download(path: string) {
    const blob = must(await this.db.storage.from(BUCKET).download(path), `download ${path}`) as Blob;
    return Buffer.from(await blob.arrayBuffer());
  }
  async signedUrl(path: string, seconds = 3600) {
    const r = must(await this.db.storage.from(BUCKET).createSignedUrl(path, seconds), `sign ${path}`) as {signedUrl: string};
    return r.signedUrl;
  }
  async removeFiles(paths: string[]) {
    if (paths.length) must(await this.db.storage.from(BUCKET).remove(paths), 'remove files');
  }
  async listFiles(prefix: string) {
    const dir = prefix.replace(/\/$/, '');
    const items = must(await this.db.storage.from(BUCKET).list(dir, {limit: 1000}), `list ${dir}`) as {name: string}[];
    return items.map((i) => `${dir}/${i.name}`);
  }
}
