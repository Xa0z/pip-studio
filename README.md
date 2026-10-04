# Pip Studio

A Telegram bot that sets up and runs a fully automated TikTok channel for each user, with an
analytics dashboard inside Telegram. It is built on Pip Explains (the original single-channel
version, now documented in [docs/PIP_EXPLAINS.md](docs/PIP_EXPLAINS.md)).

Everything runs on free tiers:

| Part | Where | Free tier |
|---|---|---|
| Bot webhook, TikTok login callback, dashboard API, Mini App | Vercel (Hobby) | yes |
| Database + file storage | Supabase | yes (500 MB DB, 1 GB files) |
| Video making, voice, scheduler | GitHub Actions | unlimited on a public repo, 2,000 min/month on a private one |
| Scripts and characters | Claude (owner: your Claude subscription; other users: their own API key) | owner yes |
| Voice | Kokoro (runs on the GitHub runner) | yes |

```
api/                    Vercel functions: telegram webhook, tiktok/callback, dashboard, health
studio/bot/             the bot (grammY): onboarding, approvals, commands, all texts
studio/lib/             database store, encryption, TikTok, metrics math, patterns, schedule
studio/worker/          GitHub Actions worker: jobs (prepare / render / finish) and the 15-minute tick
studio/server/          request handlers shared by the Vercel functions
studio/dev/             fakes, test harness and the local simulation
webapp/                 the Mini App dashboard (React + Recharts), built into public/app
supabase/migrations/    database schema
remotion/               the video (now any length from 30 to 62 s, any character)
.github/workflows/      studio-tick.yml (every 15 min), studio-job.yml (one job per video/character)
```

## How it works

1. A user opens the bot and taps through 6 steps: TikTok login, Claude, niche, goal, character, schedule.
2. The bot (on Vercel) saves each answer in Supabase. Heavy work (drawing characters, voice samples,
   videos) is a row in `jobs` plus a `workflow_dispatch` to `studio-job.yml`.
3. A job runs in three steps. **prepare** has the secrets: it asks Claude for the script, makes the
   voice and writes the character code. **render** has no secrets and no database access: it runs
   Remotion. **finish** has the secrets again: it uploads the video and sends it to Telegram.
   So character code that Claude wrote from a user's text never runs next to a token. The code also
   has to pass a strict check (only React + SVG, no network, no globals) before it is used.
4. `studio-tick.yml` runs every 15 minutes. It plans videos 75 minutes before each slot, posts approved
   videos when their time comes, saves metric snapshots, sends weekly reports and checks the minutes.
5. Before every post it refreshes the TikTok token, calls `creator_info`, uses only an allowed privacy
   level and max length, and sets `is_aigc: true` (the AI label).

---

# Setup, click by click

You need: GitHub (this repo), a Telegram account, a TikTok account + TikTok developer account,
a Supabase account, a Vercel account, Node.js 20+ on your computer, and your Claude subscription.

## 1. Make the keys you need on your computer
```
git clone https://github.com/Xa0z/pip-studio.git
cd pip-studio
npm install
npm run gen:key        # copy the output: this is MASTER_ENCRYPTION_KEY
npm run gen:key        # run again: this is TELEGRAM_WEBHOOK_SECRET (any long random text works)
```
Keep these somewhere safe. If you lose MASTER_ENCRYPTION_KEY, every saved token becomes unreadable
and users must connect again.

## 2. Telegram bot (BotFather)
1. In Telegram, open **@BotFather** and send `/newbot`.
2. Name: `Pip Studio`. Username: something ending in `bot`, e.g. `PipStudioBot`.
3. Copy the token it gives you: this is **TELEGRAM_BOT_TOKEN**. The username (without @) is **BOT_USERNAME**.
4. Send `/setdescription`, pick the bot, and paste: `I make and post TikTok videos for you, every day.`
5. Find your own Telegram user id: open **@userinfobot** and send any message. The number is **OWNER_TELEGRAM_ID**.
   Only this account can use your Claude subscription token, Full auto mode before the TikTok audit, and the built-in Pip.

(The commands, the webhook and the dashboard menu button are set by a script in step 7.)

## 3. Supabase (database and files)
1. Go to https://supabase.com, click **Start your project**, sign in with GitHub.
2. Click **New project**. Name `pip-studio`, make a strong database password, pick the region closest to you. Click **Create new project** and wait about 2 minutes.
3. In the left menu click **SQL Editor**, then **New query**.
4. Open `supabase/migrations/20261004000000_pip_studio.sql` from this repo, copy all of it, paste it, click **Run**. You should see "Success. No rows returned".
   (Or with the Supabase CLI: `npx supabase link` then `npx supabase db push`.)
5. Click **Storage** in the left menu. You should see a bucket called **pip-studio** marked *Private*.
6. Click **Project Settings** (gear), then **API**:
   - **Project URL** is **SUPABASE_URL**.
   - Under *Project API keys*, reveal **service_role** and copy it: this is **SUPABASE_SERVICE_ROLE_KEY**.
     It bypasses row level security, so it only goes into Vercel and GitHub secrets, never into the Mini App.

Every table has row level security turned on with no policies, so the public `anon` key can read nothing.
Metric snapshots can't be edited or deleted (a database trigger blocks it), except by `/disconnect`.

## 4. Vercel (bot, login callback, dashboard)
1. Go to https://vercel.com, sign in with GitHub, click **Add New... > Project**.
2. Pick the `pip-studio` repo, click **Import**.
3. Framework Preset: **Other**. Leave build settings as they are (`vercel.json` sets them).
4. Open **Environment Variables** and add these (Production):

   | Name | Value |
   |---|---|
   | TELEGRAM_BOT_TOKEN | from step 2 |
   | TELEGRAM_WEBHOOK_SECRET | from step 1 |
   | BOT_USERNAME | from step 2 |
   | OWNER_TELEGRAM_ID | from step 2 |
   | MASTER_ENCRYPTION_KEY | from step 1 |
   | SUPABASE_URL | from step 3 |
   | SUPABASE_SERVICE_ROLE_KEY | from step 3 |
   | TIKTOK_CLIENT_KEY | from step 5 (add it after step 5, then redeploy) |
   | TIKTOK_CLIENT_SECRET | from step 5 |
   | GITHUB_REPO | `Xa0z/pip-studio` |
   | GH_DISPATCH_TOKEN | from step 6 |
   | PUBLIC_BASE_URL | your Vercel address, e.g. `https://pip-studio.vercel.app` (no `/` at the end) |

5. Click **Deploy**. When it is done, open `https://<your-app>.vercel.app/api/health`. It should show `{"ok":true,...}`.
6. Copy your Vercel address: you need it for TikTok (step 5) and PUBLIC_BASE_URL.

## 5. TikTok app changes
Your existing TikTok developer app (from Pip Explains) needs a web login now, because users log in from Telegram.
1. Go to https://developers.tiktok.com, click **Manage apps**, open your app.
2. Under **Platforms**, also tick **Web**. Website URL: your Vercel address.
3. **Login Kit** > **Redirect URI** for Web: add `https://<your-app>.vercel.app/api/tiktok/callback` (exactly).
4. **Scopes**: make sure all five are added: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`.
   (`user.info.profile`/`user.info.stats` and `video.list` may need the **Display API** product: click **Add products** if they are missing.)
5. **Content Posting API**: Direct Post must be on.
6. Copy **Client key** and **Client secret** into Vercel (step 4) and GitHub (step 6), then in Vercel click **Deployments > ... > Redeploy**.
7. Add the TikTok accounts you will test with under **Sandbox / Target users** if TikTok asks for it.
   Until TikTok approves the app (the audit), posts can only be **private** (SELF_ONLY) and the app is limited to a few users.
8. When the bot works for you, submit the app for review (**Submit for review**). Use your Vercel URL,
   the privacy and terms pages from `docs/`, and a screen recording of the onboarding and the approval
   message (it shows the privacy picker, the AI label and the Music Usage Confirmation text, which TikTok checks).

## 6. GitHub secrets and the dispatch token
1. Make the dispatch token: GitHub > your avatar > **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
   Name `pip-studio-dispatch`, expiration 1 year, **Only select repositories**: `pip-studio`,
   Permissions > Repository > **Actions: Read and write**. Click **Generate** and copy it: this is **GH_DISPATCH_TOKEN**.
2. Open the repo on GitHub > **Settings > Secrets and variables > Actions > New repository secret**. Add:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `GH_DISPATCH_TOKEN`, `OWNER_TELEGRAM_ID`, `PUBLIC_BASE_URL`.
3. Optional: **Variables** tab > `ACTIONS_MINUTES_LIMIT`. Default 1700. On a **public** repo GitHub minutes are free, so you can set `0` (no limit).
4. Open the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
   Open **Pip Studio tick** and click **Enable workflow** if it says disabled.
5. Important: turn off the old Pip Explains schedule, or your channel gets two sets of videos:
   Actions > **Post Pip video** > **...** > **Disable workflow**.

## 7. Connect Telegram to Vercel
Open `https://<your-app>.vercel.app/api/setup` in your browser. You should see `"ok": true` with
`setWebhook`, `setMyCommands` and `setChatMenuButton` all `ok`. The menu button opens the dashboard.
Opening it again is harmless. If you change `TELEGRAM_WEBHOOK_SECRET`, open `/api/setup?force=<the new secret>`.

Or from your computer, in the repo folder:
```
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... PUBLIC_BASE_URL=https://<your-app>.vercel.app npm run set-webhook
```

Optional (faster cold starts): open `https://api.telegram.org/bot<TOKEN>/getMe`, copy the `result` object
and add it in Vercel as `BOT_INFO`.

## 8. Your Claude token (owner only)
On your computer run `claude setup-token`, log in, and copy the token (starts with `sk-ant-oat01-`).
You paste it into the bot in step 2 of onboarding. The bot deletes your message right away, saves the token
encrypted, and tests it with a short GitHub job. Other users must use an Anthropic API key
(https://console.anthropic.com > API keys), which costs them money per video; the bot tells them this.

## 9. Try it
Open your bot, send `/start` and follow the steps. At the end it makes one test video (DRY_RUN) and sends it
to you. Nothing is posted until the first real slot, and in Approval mode only after you tap **Post**.

---

## Commands
`/start` setup or continue · `/stats` today + 30-day chart · `/top` best videos · `/report` weekly report ·
`/dashboard` Mini App · `/settings` change niche, goal, schedule, mode, or make a new character
(the old one is kept) · `/pause` · `/resume` · `/disconnect` revokes TikTok and deletes all your data.

## Analytics
- Account snapshot every 6 hours; video snapshots at 1 h, 6 h, 24 h, 3 days, 7 days, then daily to day 30. Never deleted.
- Engagement = (likes + comments + shares) / views. 24 h velocity = views at the 24 h snapshot.
- Viral = at least 3x the user's median views (needs 3+ videos).
- Every Monday from 09:00 local: the top 20% vs bottom 20% are compared by hook type, topic group,
  post time, weekday, length and caption style. Claude turns that into a short summary and the planner
  gets the strongest patterns as hints. With fewer than 15 videos the bot says the data is too small.
- Every 5th video (20%) is an experiment with a different topic or hook, so the system keeps learning.

## Tests
```
npm test                 # old self test + 77 Pip Studio tests + type check
npx vitest run           # only the Pip Studio tests
npm run simulate -- out/sim [--fast]   # full onboarding with fake TikTok and real renders, plus screenshots
```
The tests cover the onboarding flow (owner and other users, resume, edit, TikTok login errors), token
encryption, OAuth state, initData, log redaction, metrics math, viral score, timeline math, patterns,
the character code check, time zones and DST, and the database rules (run in PGlite).

## Honest limits
- **TikTok audit.** Until TikTok approves the app, posts are private and only a few test users can log in.
  Full auto is owner-only until you set `ALLOW_AUTO_FOR_ALL=true` after approval.
- **GitHub schedule.** Scheduled runs often start a few minutes late (sometimes 15+ on busy days).
  Videos are made 75 minutes early, but a post can go out a bit after its time.
- **Minutes.** On a private repo the tick alone uses about 2,900 of the 2,000 free minutes per month
  (GitHub rounds each run up to a minute). Keep the repo **public** (secrets stay secret) or the plan is not $0.
- **Vercel Hobby** is for non-commercial use. If you charge users, you need Vercel Pro.
- **Claude for other users** costs them API money (roughly a few cents per video). Your subscription
  token is only used for your own channel.
- **Kokoro voices** are English only.
- **Supabase free** pauses a project after a week with no activity; the 15-minute tick keeps it awake.
- **Characters** are drawn by Claude as code. They are checked and run without secrets, but how good
  they look depends on Claude; the user can ask for 3 new versions as often as they want.
