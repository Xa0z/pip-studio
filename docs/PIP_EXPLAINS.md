# Pip Explains: automatic TikTok videos

Every day GitHub Actions makes and posts 3 videos ("Did you know? #N") with Pip, the orange robot:
Claude writes the script, Kokoro speaks it, Whisper times every word, Remotion renders a 62-second
1080x1920 video, and the TikTok Content Posting API publishes it at 09:00, 15:00 and 21:00 (Asia/Baghdad).

Everything here is free: Kokoro and Whisper run on the GitHub runner, Claude runs through your Claude
subscription (Claude Code), and GitHub Actions/Pages are free on a public repo.

```
remotion/character/Pip.tsx   the one and only Pip
remotion/scenes/             hook, 6 fact layouts, recap, call to action
remotion/Video.tsx           the 62 s video built from JSON
src/plan.ts                  Claude writes the script (strict JSON, zod, 3 retries)
src/voice.ts                 Kokoro voice + Whisper word timings
src/render.ts                renders and checks the real mp4 is 62.00 s
src/publish.ts / auth.ts     TikTok upload and login
src/run.ts                   one full cycle: plan -> voice -> render -> check -> publish -> log
src/history.json             past episodes, topics, categories, next episode number
pip.config.json              voice, times, privacy, Claude model
```

## What you need (all free)
- A GitHub account (repo: `pip-studio`)
- A TikTok account and a TikTok developer account
- A Claude subscription (for `claude setup-token`)
- Node.js 20+ on your computer (only for the one-time TikTok login)
- Telegram (for failure alerts)

---

## 1. Get the code on your computer
```
git clone https://github.com/Xa0z/pip-studio.git
cd pip-studio
npm install
cp .env.example .env
```

## 2. Turn on GitHub Pages (legal pages for TikTok review)
1. On GitHub open the repo, click **Settings**, then **Pages** in the left menu.
2. Under **Build and deployment**, Source: **Deploy from a branch**.
3. Branch: **main**, folder: **/docs**. Click **Save**.
4. Wait about a minute. Your pages are:
   - Home: `https://xa0z.github.io/pip-studio/`
   - Terms: `https://xa0z.github.io/pip-studio/terms.html`
   - Privacy: `https://xa0z.github.io/pip-studio/privacy.html`

## 3. Make the TikTok developer app
1. Go to https://developers.tiktok.com and log in with your TikTok account.
2. Click **Manage apps**, then **Connect an app**. Choose **Individual**.
3. App info:
   - App name: `Pip Explains`, upload an icon (a Pip screenshot is fine), category **Education**.
   - Description: "Posts my own original science videos to my own TikTok account."
   - Terms of Service URL and Privacy Policy URL: the two links from step 2.
   - Platform: tick **Desktop**.
4. Click **Add products** and add **Login Kit** and **Content Posting API**.
5. **Login Kit**: add the redirect URI `http://localhost:3455/callback/` (exactly, with the last `/`).
6. **Content Posting API**: turn on **Direct Post**.
7. **Scopes**: make sure `user.info.basic` and `video.publish` are added.
8. At the top switch to **Sandbox**, create a sandbox, and add your own TikTok account under **Target users**.
   (Sandbox lets you test right away. Sandbox and unaudited apps can only post **private** videos.)
9. Copy the **Client key** and **Client secret** into `.env`:
   `TIKTOK_CLIENT_KEY=...` and `TIKTOK_CLIENT_SECRET=...`. Never paste them in chat.

> If TikTok does not let you use Content Posting API with the Desktop platform, tick **Web** instead,
> use the redirect URI `https://xa0z.github.io/pip-studio/callback.html`, and add
> `TIKTOK_REDIRECT_URI=https://xa0z.github.io/pip-studio/callback.html` to `.env`.
> The login then shows a code on that page and the script asks you to paste it.

## 4. Make the encryption key
```
npm run gen:key
```
Put the printed value in `.env` as `TOKEN_ENCRYPTION_KEY=...`. You will also add it to GitHub secrets.
Keep it safe: without it the saved TikTok login can't be read.

## 5. Log in to TikTok once
```
npm run tiktok:login
```
Your browser opens. Approve the app. The terminal prints `Logged in as <your name>`.
The login is saved encrypted in `state/tiktok-tokens.enc`. Commit it so GitHub can post:
```
git add state/tiktok-tokens.enc && git commit -m "TikTok login" && git push
```
The access token lasts 24 hours and the refresh token about a year. The robot refreshes before every post
and saves the new tokens back to the repo automatically. Run `npm run tiktok:login` again only if TikTok
says the login expired.

## 6. Check what TikTok allows
```
npm run tiktok:check
```
It prints your username, the allowed privacy levels and the max video length. 62 s must be allowed.
Commit `state/tiktok-tokens.enc` again afterwards (the check refreshes it).

## 7. Claude token (free with your Claude plan)
On your computer, with Claude Code installed (`npm install -g @anthropic-ai/claude-code`):
```
claude setup-token
```
Copy the token it prints. You'll save it as `CLAUDE_CODE_OAUTH_TOKEN`.

## 8. Telegram alerts
1. In Telegram open **@BotFather**, send `/newbot`, follow the steps, copy the **bot token**.
2. Open your new bot and send it any message (e.g. "hi").
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in your browser and copy the number at
   `"chat":{"id": ...}`. That's your **chat id**.

## 9. Add the GitHub secrets
GitHub repo, **Settings**, **Secrets and variables**, **Actions**, **New repository secret**. Add each one:

| Name | Value |
|---|---|
| `TIKTOK_CLIENT_KEY` | from step 3 |
| `TIKTOK_CLIENT_SECRET` | from step 3 |
| `TOKEN_ENCRYPTION_KEY` | from step 4 |
| `CLAUDE_CODE_OAUTH_TOKEN` | from step 7 |
| `TELEGRAM_BOT_TOKEN` | from step 8 |
| `TELEGRAM_CHAT_ID` | from step 8 |

Optional (costs money, off by default): `ANTHROPIC_API_KEY` makes it use the paid Claude API instead of Claude Code.

## 10. Pick Pip's voice
GitHub, **Actions**, **Voice samples**, **Run workflow**. When it's done, open the **previews-samples**
branch (or the run's artifact) and listen to `af_heart.wav`, `am_puck.wav`, `bf_emma.wav`.
Put your pick in `pip.config.json` as `"PIP_VOICE"` and push. Locally: `npm run voice:samples`.

## 11. Test with DRY_RUN (nothing is posted)
GitHub, **Actions**, **Post Pip video**, **Run workflow**, keep **dry_run** ticked, count `3`.
The videos land in the run's artifact (kept 7 days) and on the **previews-videos** branch.
Locally: `npm run dry-run` (needs Claude Code logged in on your computer).

## 12. Turn on posting
Nothing else to do: the schedule in `.github/workflows/post.yml` runs at 05:40, 11:40 and 17:40 UTC,
makes one video, waits for the slot (09:00, 15:00, 21:00 Baghdad time) and posts it.
To stop it: GitHub, **Actions**, **Post Pip video**, **...**, **Disable workflow**.

## 13. Submit the TikTok app for audit (important)
Until TikTok audits your app, **every post is private (only you can see it)**.
1. developers.tiktok.com, your app, switch from **Sandbox** to **Production**.
2. Fill in everything, add the Pages URLs from step 2, and upload a short screen recording that shows
   the login (`npm run tiktok:login`) and a video being posted.
3. Click **Submit for review**. It is free and usually takes a few days to a few weeks.

Heads-up: TikTok sometimes rejects apps that post fully automatically. If that happens, set
`"TIKTOK_POST_MODE": "inbox"` in `pip.config.json`, run `npm run tiktok:login` again (it then also asks for
`video.upload`), and videos land in your TikTok inbox where you tap Post.

---

## Settings (`pip.config.json`)
| Key | Meaning |
|---|---|
| `PIP_VOICE` | Kokoro voice, always the same (part of Pip's identity) |
| `VOICE_SPEED` | Starting speed. The robot changes it between 0.9 and 1.1 to fit 58–61 s |
| `TIMEZONE`, `SLOTS` | Posting times. If you change them, also change the cron lines in `post.yml` |
| `TIKTOK_PRIVACY` | Wanted privacy; if TikTok doesn't allow it, the robot uses an allowed one |
| `TIKTOK_POST_MODE` | `direct` (post) or `inbox` (you tap Post in the app) |
| `CLAUDE_MODEL` | Model for Claude Code (`opus`) |
| `WHISPER_MODEL` | `base.en` (good) or `tiny.en` (faster) |
| `MONTHLY_MINUTES_WARNING` | Telegram warning when Actions use passes this many minutes in a month |

## Music
Put royalty-free tracks you own the rights to in `assets/music/` (mp3/wav/m4a). They play at 10% under the voice.
Empty folder = no music.

## How the video length is kept exact
1. Claude writes 150–165 words in 8–12 scenes (hook, facts, recap, call to action).
2. Each scene is spoken by Kokoro. If total speech isn't 58–61 s, the speed is adjusted (0.9–1.1);
   if that's not enough, Claude shortens or lengthens the script (max 4 times).
3. Scene lengths come from the real audio, the last scene fills up to frame 1860, and the sum is checked.
4. After rendering, the real mp4 is measured; anything other than 1860 frames / 62 s fails the run.

## Logs and failures
Every step is logged in the Actions run. Each run's time is logged and saved in `state/runs.jsonl`.
If one video fails, the others still run (each slot is its own run), and you get a Telegram message.

## Local commands
| Command | What it does |
|---|---|
| `npm test` | Self-tests (schema, timing math, word matching) + type check |
| `npm run studio` | Opens Remotion Studio to look at the video and Pip's preview |
| `npm run preview:pip` | Renders Pip's preview video |
| `npm run voice:samples` | 3 voice samples into `samples/` |
| `npm run dry-run` | 3 full videos into `out/`, nothing posted |
| `npm run tiktok:login` / `tiktok:check` | TikTok login / account check |
| `npm run gen:key` | New encryption key |
