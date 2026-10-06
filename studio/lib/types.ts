import type {ThemeChoice} from '../../src/themes.js';
/** Row types, matching supabase/migrations. */
import type {Goal} from './goals.js';
import type {VideoFeatures} from './patterns.js';

export type UserStatus = 'onboarding' | 'active' | 'paused' | 'paused_quota' | 'disconnected';
export type Mode = 'approval' | 'auto';
export type VideoStatus = 'planned' | 'rendering' | 'awaiting_approval' | 'approved' | 'publishing' | 'posted' | 'skipped' | 'failed';
export type JobKind = 'render' | 'dry_run' | 'character_preview' | 'voice_samples' | 'claude_check' | 'publish' | 'metrics' | 'weekly_analysis' | 'chart';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** What the bot waits for when the user types text instead of tapping. */
export type Awaiting = 'claude_secret' | 'custom_niche' | 'link_url' | 'description' | 'timezone' | 'times' | 'theme_colors' | 'business_info' | 'ref_videos' | 'ref_notes' | null;

/** What kind of videos a user gets: daily explainers about their niches, or marketing videos for their business. */
export type ContentMode = 'explainer' | 'marketing';

/** A reference video the user uploaded in Telegram (we keep only Telegram's file id, not the file). */
export type RefVideo = {file_id: string; duration: number; width?: number; height?: number; file_size?: number; name?: string};

/** One day's marketing brief: 3 references and what to change. `day` is the local date the videos post (YYYY-MM-DD). */
export type MarketingBrief = {day: string; refs: RefVideo[]; notes: string; created_at: string};

/** What a marketing video is based on. Saved on the video row (plan.marketing) so a regenerate keeps it. */
export type MarketingInput = {business: string; ref: RefVideo; notes: string; day: string; index: number};

export type OnboardingData = {
  awaiting?: Awaiting;
  niches?: string[];
  goal?: Goal;
  link_url?: string;
  has_character?: boolean;
  description?: string;
  character_batch?: number;
  character_id?: string;
  character_name?: string;
  voice_id?: string;
  voice_options?: string[];
  timezone?: string;
  posts_per_day?: number;
  post_times?: string[];
  mode?: Mode;
  /** The look of this user's videos. Missing = Sage. */
  video_theme?: ThemeChoice;
  /** Set when a change comes from /settings instead of first-time onboarding. */
  editing?: 'niche' | 'goal' | 'schedule' | 'mode' | 'character' | 'theme' | 'business' | null;
  /** Explainer (default) or marketing videos. */
  content_mode?: ContentMode;
  /** The user's own words about their business: name, what they sell, who for, offer, link. */
  business?: string;
  /** References being collected right now (before the notes come in). */
  ref_draft?: RefVideo[];
  /** Saved briefs, newest last (we keep the last few). */
  marketing_briefs?: MarketingBrief[];
  /** Local date we last asked for tomorrow's references, so we ask once a day. */
  marketing_asked?: string;
  /** Job we are waiting on (character previews, voice samples, Claude check). */
  pending_job?: string | null;
};

export type UserRow = {
  id: number;
  tg_username: string | null;
  first_name: string | null;
  is_owner: boolean;
  status: UserStatus;
  onboarding_step: number;
  onboarding_data: OnboardingData;
  created_at: string;
  updated_at: string;
};

export type TikTokRow = {
  user_id: number;
  open_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  access_expires_at: string;
  refresh_expires_at: string;
  scopes: string[];
  connected_at: string;
};

export type ClaudeRow = {
  user_id: number;
  kind: 'oauth_token' | 'api_key';
  secret_enc: string;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
};

export type SettingsRow = {
  user_id: number;
  niches: string[];
  goal: Goal;
  link_url: string | null;
  timezone: string;
  posts_per_day: number;
  post_times: string[];
  mode: Mode;
  experiment_rate: number;
  privacy_default: string | null;
  updated_at?: string;
};

export type CharacterRow = {
  id: string;
  user_id: number;
  name: string | null;
  description: string | null;
  batch: number;
  version: number | null;
  status: 'candidate' | 'locked' | 'archived';
  code: string | null;
  code_sha256: string | null;
  preview_path: string | null;
  voice_id: string | null;
  locked_at: string | null;
  created_at: string;
};

export type VideoRow = {
  id: string;
  user_id: number;
  character_id: string | null;
  slot_at: string;
  status: VideoStatus;
  is_dry_run: boolean;
  is_experiment: boolean;
  plan: any;
  features: VideoFeatures | null;
  caption: string | null;
  duration_s: number | null;
  video_path: string | null;
  thumb_path: string | null;
  privacy_options: string[] | null;
  privacy: string | null;
  tiktok_publish_id: string | null;
  tiktok_video_id: string | null;
  share_url: string | null;
  approval_msg_id: number | null;
  posted_at: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at?: string;
};

export type VideoMetricRow = {id?: number; video_id: string; checkpoint: string; captured_at: string; views: number; likes: number; comments: number; shares: number};
export type AccountMetricRow = {id?: number; user_id: number; captured_at: string; followers: number; following: number; likes: number; video_count: number};

export type PatternRow = {
  id: string;
  user_id: number;
  week_start: string;
  sample_size: number;
  too_small: boolean;
  summary: string | null;
  items: any[];
  changes: string[];
  active: boolean;
  created_at: string;
};

export type JobRow = {
  id: string;
  user_id: number | null;
  video_id: string | null;
  kind: JobKind;
  status: JobStatus;
  input: Record<string, any>;
  result: Record<string, any> | null;
  gh_run_id: number | null;
  attempts: number;
  log: string | null;
  minutes_used: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type UsageRow = {month: string; actions_minutes: number; warned_at: string | null; paused_at: string | null};
