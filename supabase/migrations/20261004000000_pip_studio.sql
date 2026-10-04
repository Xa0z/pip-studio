-- Pip Studio: database schema.
-- Row level security is ON for every table with NO policies: the public anon key can read nothing.
-- Only the server (Vercel functions and GitHub Actions, using the service role key) reads and writes.
-- Columns ending in _enc hold AES-256-GCM ciphertext made by the app (key: MASTER_ENCRYPTION_KEY).

-- gen_random_uuid() is built in (Postgres 13+).

-- ---------- enums ----------
create type user_status  as enum ('onboarding', 'active', 'paused', 'paused_quota', 'disconnected');
create type goal_type    as enum ('followers', 'views', 'creator_rewards', 'traffic');
create type post_mode    as enum ('approval', 'auto');
create type claude_kind  as enum ('oauth_token', 'api_key');
create type char_status  as enum ('candidate', 'locked', 'archived');
create type video_status as enum ('planned', 'rendering', 'awaiting_approval', 'approved', 'publishing', 'posted', 'skipped', 'failed');
create type job_kind     as enum ('render', 'dry_run', 'character_preview', 'voice_samples', 'claude_check', 'publish', 'metrics', 'weekly_analysis', 'chart');
create type job_status   as enum ('queued', 'running', 'done', 'failed');

-- ---------- helpers ----------
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- tables ----------
create table users (
  id              bigint primary key,                       -- Telegram user id
  tg_username     text,
  first_name      text,
  is_owner        boolean not null default false,
  status          user_status not null default 'onboarding',
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 7), -- 7 = done
  onboarding_data jsonb not null default '{}'::jsonb,       -- half-finished answers and what we wait for
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger users_touch before update on users for each row execute function touch_updated_at();

create table tiktok_accounts (
  user_id            bigint primary key references users(id) on delete cascade,
  open_id            text not null unique,
  username           text,
  display_name       text,
  avatar_url         text,
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  scopes             text[] not null default '{}',
  connected_at       timestamptz not null default now()
);

create table claude_credentials (
  user_id         bigint primary key references users(id) on delete cascade,
  kind            claude_kind not null,
  secret_enc      text not null,
  last_checked_at timestamptz,
  last_check_ok   boolean
);

create table settings (
  user_id         bigint primary key references users(id) on delete cascade,
  niches          text[] not null check (array_length(niches, 1) between 1 and 2),
  goal            goal_type not null,
  link_url        text,
  timezone        text not null,
  posts_per_day   smallint not null check (posts_per_day between 1 and 3),
  post_times      text[] not null,                          -- local "HH:MM", one per post
  mode            post_mode not null default 'approval',
  experiment_rate numeric not null default 0.2 check (experiment_rate between 0 and 0.5),
  privacy_default text,
  updated_at      timestamptz not null default now(),
  check (array_length(post_times, 1) = posts_per_day)
);
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

create table characters (
  id           uuid primary key default gen_random_uuid(),
  user_id      bigint not null references users(id) on delete cascade,
  name         text,
  description  text,                                        -- null = "no character"
  batch        smallint not null default 1,
  version      smallint,                                    -- 1, 2, 3 within a batch
  status       char_status not null default 'candidate',
  code         text,                                        -- React/SVG component source
  code_sha256  text,
  preview_path text,                                        -- storage path of the 4-expression PNG
  voice_id     text,                                        -- Kokoro voice, set when picked
  locked_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index characters_user on characters(user_id, batch);
create unique index one_locked_character on characters(user_id) where status = 'locked';

-- A locked character's look and voice never change. It can only be archived (code kept).
create or replace function protect_locked_character() returns trigger language plpgsql as $$
begin
  if old.status = 'locked' then
    if new.code is distinct from old.code or new.code_sha256 is distinct from old.code_sha256
       or new.voice_id is distinct from old.voice_id or new.description is distinct from old.description then
      raise exception 'character % is locked and cannot be changed', old.id;
    end if;
    if new.status not in ('locked', 'archived') then
      raise exception 'a locked character can only be archived';
    end if;
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'an archived character stays archived';
  end if;
  return new;
end $$;
create trigger characters_protect before update on characters for each row execute function protect_locked_character();

create table videos (
  id                uuid primary key default gen_random_uuid(),
  user_id           bigint not null references users(id) on delete cascade,
  character_id      uuid references characters(id),
  slot_at           timestamptz not null,
  status            video_status not null default 'planned',
  is_dry_run        boolean not null default false,
  is_experiment     boolean not null default false,
  plan              jsonb,
  features          jsonb,
  caption           text,
  duration_s        numeric,
  video_path        text,
  thumb_path        text,
  privacy_options   text[],                                  -- from creator_info when the video was made
  privacy           text,
  tiktok_publish_id text,
  tiktok_video_id   text,
  share_url         text,
  approval_msg_id   bigint,
  posted_at         timestamptz,
  attempts          smallint not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- One real video per user per slot, so an overlapping cron can't post twice.
create unique index videos_one_per_slot on videos(user_id, slot_at) where not is_dry_run and status <> 'failed' and status <> 'skipped';
create index videos_user_posted on videos(user_id, posted_at);
create index videos_status on videos(status, slot_at);
create trigger videos_touch before update on videos for each row execute function touch_updated_at();

create table video_metrics (
  id          bigserial primary key,
  video_id    uuid not null references videos(id) on delete cascade,
  checkpoint  text not null,                                -- 1h 6h 24h 3d 7d d8 .. d30
  captured_at timestamptz not null default now(),
  views       bigint not null default 0,
  likes       bigint not null default 0,
  comments    bigint not null default 0,
  shares      bigint not null default 0,
  unique (video_id, checkpoint)
);

create table account_metrics (
  id          bigserial primary key,
  user_id     bigint not null references users(id) on delete cascade,
  captured_at timestamptz not null default now(),
  followers   bigint not null default 0,
  following   bigint not null default 0,
  likes       bigint not null default 0,
  video_count bigint not null default 0
);
create index account_metrics_user on account_metrics(user_id, captured_at);

-- Snapshots are the only history TikTok gives us: never update or delete them,
-- except when the whole user is deleted with delete_user_data() (/disconnect).
create or replace function protect_snapshots() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'metric snapshots are append-only';
  end if;
  if coalesce(current_setting('pip.allow_delete', true), '') <> 'on' then
    raise exception 'metric snapshots are never deleted (use delete_user_data for /disconnect)';
  end if;
  return old;
end $$;
create trigger video_metrics_protect before update or delete on video_metrics for each row execute function protect_snapshots();
create trigger account_metrics_protect before update or delete on account_metrics for each row execute function protect_snapshots();

create table patterns (
  id          uuid primary key default gen_random_uuid(),
  user_id     bigint not null references users(id) on delete cascade,
  week_start  date not null,
  sample_size int not null,
  too_small   boolean not null,
  summary     text,
  items       jsonb not null default '[]'::jsonb,           -- [{text, feature, value, lift, n, confidence}]
  changes     jsonb not null default '[]'::jsonb,           -- what the planner will do differently
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create table jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      bigint references users(id) on delete cascade,
  video_id     uuid references videos(id) on delete set null,
  kind         job_kind not null,
  status       job_status not null default 'queued',
  input        jsonb not null default '{}'::jsonb,
  result       jsonb,
  gh_run_id    bigint,
  attempts     smallint not null default 0,
  log          text,                                        -- redacted before saving
  minutes_used numeric,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index jobs_status on jobs(status, created_at);

create table usage_monthly (
  month           date primary key,                         -- first day of the month (UTC)
  actions_minutes numeric not null default 0,
  warned_at       timestamptz,
  paused_at       timestamptz,
  updated_at      timestamptz not null default now()
);

-- ---------- views ----------
create view video_latest_metrics as
select distinct on (m.video_id)
  m.video_id, v.user_id, m.checkpoint, m.captured_at, m.views, m.likes, m.comments, m.shares,
  case when m.views > 0 then (m.likes + m.comments + m.shares)::numeric / m.views else 0 end as engagement_rate
from video_metrics m join videos v on v.id = m.video_id
order by m.video_id, m.captured_at desc;

create view account_daily as
select distinct on (user_id, (captured_at at time zone 'utc')::date)
  user_id, (captured_at at time zone 'utc')::date as day, followers, following, likes, video_count
from account_metrics
order by user_id, (captured_at at time zone 'utc')::date, captured_at desc;

-- ---------- functions ----------
-- /disconnect: delete everything for one user, snapshots included.
create or replace function delete_user_data(uid bigint) returns void language plpgsql security definer as $$
begin
  perform set_config('pip.allow_delete', 'on', true);
  delete from users where id = uid;
end $$;

-- Adds minutes to this month's counter and returns the new total.
create or replace function add_actions_minutes(m numeric) returns numeric language plpgsql security definer as $$
declare total numeric;
begin
  insert into usage_monthly(month, actions_minutes) values (date_trunc('month', now() at time zone 'utc')::date, m)
  on conflict (month) do update set actions_minutes = usage_monthly.actions_minutes + excluded.actions_minutes, updated_at = now()
  returning actions_minutes into total;
  return total;
end $$;

-- ---------- security ----------
alter table users              enable row level security;
alter table tiktok_accounts    enable row level security;
alter table claude_credentials enable row level security;
alter table settings           enable row level security;
alter table characters         enable row level security;
alter table videos             enable row level security;
alter table video_metrics      enable row level security;
alter table account_metrics    enable row level security;
alter table patterns           enable row level security;
alter table jobs               enable row level security;
alter table usage_monthly      enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    revoke execute on function delete_user_data(bigint) from public;
    revoke execute on function add_actions_minutes(numeric) from public;
    grant execute on function delete_user_data(bigint) to service_role;
    grant execute on function add_actions_minutes(numeric) to service_role;
    -- views run with the caller's rights so RLS still applies
    execute 'alter view video_latest_metrics set (security_invoker = true)';
    execute 'alter view account_daily set (security_invoker = true)';
  end if;
end $$;

-- Private storage bucket for previews, voices, videos, thumbnails and charts.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('pip-studio', 'pip-studio', false) on conflict (id) do nothing;
  end if;
end $$;
