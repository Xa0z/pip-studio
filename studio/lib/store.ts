/** Everything the bot, API and worker need from the database and file storage. */
import type {
  AccountMetricRow, CharacterRow, ClaudeRow, JobRow, PatternRow, SettingsRow, TikTokRow, UsageRow, UserRow, UserStatus, VideoMetricRow, VideoRow, VideoStatus,
} from './types.js';

export type New<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface Store {
  getUser(id: number): Promise<UserRow | null>;
  createUser(u: Pick<UserRow, 'id' | 'tg_username' | 'first_name' | 'is_owner'>): Promise<UserRow>;
  updateUser(id: number, patch: Partial<UserRow>): Promise<UserRow>;
  listUsers(status?: UserStatus[]): Promise<UserRow[]>;
  deleteUserData(id: number): Promise<void>;

  getTikTok(userId: number): Promise<TikTokRow | null>;
  getTikTokByOpenId(openId: string): Promise<TikTokRow | null>;
  saveTikTok(row: New<TikTokRow, 'connected_at'>): Promise<void>;

  getClaude(userId: number): Promise<ClaudeRow | null>;
  saveClaude(row: ClaudeRow): Promise<void>;
  deleteClaude(userId: number): Promise<void>;

  getSettings(userId: number): Promise<SettingsRow | null>;
  saveSettings(row: SettingsRow): Promise<void>;

  insertCharacter(row: New<CharacterRow, 'id' | 'created_at' | 'locked_at' | 'voice_id' | 'preview_path' | 'code_sha256'>): Promise<CharacterRow>;
  updateCharacter(id: string, patch: Partial<CharacterRow>): Promise<CharacterRow>;
  getCharacter(id: string): Promise<CharacterRow | null>;
  listCharacters(userId: number): Promise<CharacterRow[]>;
  getLockedCharacter(userId: number): Promise<CharacterRow | null>;

  insertVideo(row: Partial<VideoRow> & Pick<VideoRow, 'user_id' | 'slot_at'>): Promise<VideoRow>;
  updateVideo(id: string, patch: Partial<VideoRow>): Promise<VideoRow>;
  getVideo(id: string): Promise<VideoRow | null>;
  /** Real (not dry-run) videos of a user, newest slot first. */
  listVideos(userId: number, opts?: {status?: VideoStatus[]; includeDryRun?: boolean; limit?: number}): Promise<VideoRow[]>;
  /** Videos of all users in these statuses (for the scheduler). */
  videosByStatus(status: VideoStatus[]): Promise<VideoRow[]>;
  /** Posted videos with posted_at after `since` (for metric snapshots). */
  postedSince(since: string): Promise<VideoRow[]>;

  insertVideoMetric(row: VideoMetricRow): Promise<void>;
  listVideoMetrics(videoIds: string[]): Promise<VideoMetricRow[]>;
  insertAccountMetric(row: AccountMetricRow): Promise<void>;
  listAccountMetrics(userId: number, since?: string): Promise<AccountMetricRow[]>;

  savePattern(row: New<PatternRow, 'id' | 'created_at'>): Promise<PatternRow>;
  latestPattern(userId: number): Promise<PatternRow | null>;

  insertJob(row: Partial<JobRow> & Pick<JobRow, 'kind'>): Promise<JobRow>;
  updateJob(id: string, patch: Partial<JobRow>): Promise<JobRow>;
  getJob(id: string): Promise<JobRow | null>;
  listJobs(opts: {status?: JobRow['status'][]; userId?: number; kind?: JobRow['kind'][]}): Promise<JobRow[]>;

  addActionsMinutes(minutes: number): Promise<number>;
  getUsage(month: string): Promise<UsageRow | null>;
  updateUsage(month: string, patch: Partial<UsageRow>): Promise<void>;

  upload(path: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<Buffer>;
  signedUrl(path: string, seconds?: number): Promise<string>;
  removeFiles(paths: string[]): Promise<void>;
  listFiles(prefix: string): Promise<string[]>;
}

export const monthKey = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;
