/** Every message the bot sends. Plain, friendly, short. HTML parse mode. */
import {GOALS, type Goal} from '../lib/goals.js';
import {fmtNum, fmtPct} from '../lib/metrics.js';
import {nicheLabel} from '../lib/niches.js';
import type {Mode} from '../lib/types.js';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const STEP_NAMES = ['Connect TikTok', 'Connect Claude', 'Niche', 'Goal', 'Character', 'Schedule'];

export const progress = (step: number) => {
  const bar = '▰'.repeat(step) + '▱'.repeat(6 - step);
  return `<b>Step ${step} of 6 · ${STEP_NAMES[step - 1]}</b>  ${bar}`;
};

export const T = {
  welcome: (name: string) =>
    `👋 Hi ${esc(name)}! I'm <b>Pip Studio</b>.\n\nI'll set up a TikTok channel that makes and posts animated videos for you, every day.\n\nSetup takes about 5 minutes. You can stop anytime and come back with /start.`,
  welcomeBack: (step: number) => `👋 Welcome back! Let's continue where you stopped (step ${step} of 6).`,

  // Step 1
  connectTikTok: () =>
    `${progress(1)}\n\nFirst, connect your TikTok account. I'll only use it to post the videos you make here and to read your stats.\n\nThe link works for 10 minutes.`,
  tiktokConnected: (username: string, followers: number, likes: number, videos: number) =>
    `✅ Connected as <b>@${esc(username)}</b>\n${fmtNum(followers)} followers · ${fmtNum(likes)} likes · ${fmtNum(videos)} videos`,
  tiktokFailed: (why: string) => `⚠️ ${esc(why)} Let's try again.`,
  tiktokTaken: () => `⚠️ That TikTok account is already connected to another Telegram user. Log in with a different TikTok account.`,

  // Step 2
  connectClaudeOwner: () =>
    `${progress(2)}\n\nNow connect Claude. It writes your scripts.\n\nOn your computer run:\n<code>claude setup-token</code>\n\nThen paste the token here. I'll delete your message right away.`,
  connectClaudeUser: () =>
    `${progress(2)}\n\nNow connect Claude. It writes your scripts.\n\nYou need your own Anthropic API key:\n1. Go to <b>console.anthropic.com</b> and sign in\n2. Open <b>Settings → API keys → Create key</b>\n3. Paste it here. I'll delete your message right away.\n\nHeads up: API use is billed by Anthropic to you. One video is usually a few cents.`,
  claudeGuide: () =>
    `<b>Getting an Anthropic API key</b>\n1. Open console.anthropic.com and make an account\n2. Add a payment method under <b>Billing</b> (a few dollars is enough to start)\n3. Go to <b>Settings → API keys</b>, tap <b>Create key</b>, name it "Pip Studio"\n4. Copy the key (it starts with <code>sk-ant-api</code>) and paste it here`,
  claudeDeleted: () => `🔒 Got it and deleted your message. Testing…`,
  claudeOk: () => `✅ Claude works!`,
  claudeOwnerTesting: () => `🔒 Got it and deleted your message.\nI'm testing the token on GitHub now. You can keep going, I'll tell you if it doesn't work.`,
  claudeBad: (why: string) => `❌ That didn't work (${esc(why)}). Paste it again.`,
  claudeWrongKind: (owner: boolean) =>
    owner
      ? `That doesn't look like a Claude token. It should start with <code>sk-ant-oat</code> (from <code>claude setup-token</code>) or <code>sk-ant-api</code>. Paste it again.`
      : `That doesn't look like an Anthropic API key. It should start with <code>sk-ant-api</code>. Paste it again.`,
  claudeSubscriptionNotAllowed: () =>
    `That's a Claude subscription token. Pip Studio can only use your own <b>API key</b> (it starts with <code>sk-ant-api</code>). Paste an API key instead.`,
  claudeCheckFailed: (why: string) => `❌ Your Claude token didn't work on GitHub (${esc(why)}). Run <code>claude setup-token</code> again and paste the new token.`,
  claudeCheckOk: () => `✅ Claude token works on GitHub.`,

  // Step 3
  chooseNiche: (picked: string[]) =>
    `${progress(3)}\n\nWhat should your videos be about? Pick 1 or 2. I'll switch between them.${picked.length ? `\n\nPicked: ${picked.map(nicheLabel).join(', ')}` : ''}`,
  nicheMax: () => `You can pick up to 2. Tap one again to remove it.`,
  nicheNeedOne: () => `Pick at least one niche first.`,
  customNiche: () => `✏️ Type your niche in a few words (e.g. "weird ocean facts").`,
  customNicheBad: () => `Please type 3 to 40 characters, like "weird ocean facts".`,

  // Step 4
  chooseGoal: () => `${progress(4)}\n\nWhat's your main goal?`,
  goalCreatorRewards: () => `Note: TikTok's Creator Rewards needs 10,000 followers and age 18+. Videos will be exactly 62 seconds.`,
  askLink: () => `🔗 Send me your link (it should start with https://). I'll point viewers to the link in your bio.`,
  linkBad: () => `That doesn't look like a link. Send something like https://example.com`,

  // Step 5
  askCharacter: () => `${progress(5)}\n\nDo you want a character in your videos?`,
  describeCharacter: () =>
    `Describe your character in one line.\nExample: <i>"a small green alien with big glasses"</i>\n\nPlease make it original. I can't copy famous characters like Mickey or Pikachu.`,
  famous: (name: string) => `That looks like ${esc(name)}, which belongs to someone else. Let's make your own! Try something like <i>"a tiny blue robot with a cape"</i>.`,
  descriptionBad: () => `Please describe it in 5 to 200 characters.`,
  drawing: () => `🎨 Drawing 3 versions… This takes a few minutes. I'll send them here.`,
  pickCharacter: () => `Which one do you like?`,
  characterLocked: (name: string) => `🔒 Locked! <b>${esc(name)}</b> will look exactly the same in every video.`,
  noCharacter: () => `👍 No character. Videos will use text and visuals only.`,
  makingVoices: () => `🎙 Making voice samples… I'll send them in a minute.`,
  pickVoice: (name: string | null) => `Now pick a voice. Listen to these 3${name ? `, that's ${esc(name)} saying hello` : ''}:`,
  voicePicked: () => `🎙 Voice saved.`,
  jobFailed: (what: string) => `❌ Something went wrong while ${what}. Tap Retry.`,
  stillWorking: () => `⏳ Still working on it. I'll message you when it's ready.`,

  // Step 6
  askTimezone: () => `${progress(6)}\n\nWhat's your time zone?`,
  typeTimezone: () => `⌨️ Type your time zone, like <code>Asia/Baghdad</code>, <code>Berlin</code> or <code>UTC+3</code>.`,
  timezoneBad: () => `I don't know that time zone. Try <code>Europe/Berlin</code>, <code>Tokyo</code> or <code>UTC+3</code>.`,
  askPostsPerDay: () => `How many videos per day?`,
  suggestTimes: (times: string[], niches: string[]) => `I suggest posting at <b>${times.join(', ')}</b> your time. Evenings usually do well for ${niches.map(nicheLabel).join(' and ')}.`,
  typeTimes: (n: number) => `✏️ Type ${n} time${n > 1 ? 's' : ''} in 24h format, like <code>${['19:00', '12:00, 20:00', '09:00, 15:00, 21:00'][n - 1]}</code>.`,
  timesBad: (n: number) => `I need exactly ${n} different time${n > 1 ? 's' : ''} like <code>09:00</code>. Try again.`,
  askMode: () =>
    `How should posting work?\n\n✋ <b>Approval mode</b>: I send each video here first with Post / Skip / Regenerate.\n⚡ <b>Full auto</b>: I post by myself and tell you after.`,
  autoNotAllowed: () =>
    `⚡ Full auto is only for the owner until TikTok approves this app (their rules say each post needs your OK). I set <b>Approval mode</b> for now.`,
  summary: (s: {username: string; niches: string[]; goal: Goal; character: string | null; voice: string; theme: string; times: string[]; tz: string; mode: Mode; link?: string}) =>
    `📋 <b>Here's your channel:</b>\nTikTok: @${esc(s.username)}\nNiche: ${s.niches.map(nicheLabel).join(', ')}\nGoal: ${GOALS[s.goal].emoji} ${GOALS[s.goal].label}${s.link ? ` (${esc(s.link)})` : ''}\nCharacter: ${s.character ? esc(s.character) : 'none'} · Voice: ${esc(s.voice)}\nTheme: ${esc(s.theme)}\nPosts: ${s.times.length}/day at ${s.times.join(', ')} (${esc(s.tz)})\nMode: ${s.mode === 'approval' ? '✋ Approval' : '⚡ Full auto'}`,
  askTheme: () =>
    `🎨 <b>Pick a look for your videos.</b>\nThis sets the background, text and highlight colours. You can change it any time in /settings.`,
  typeTheme: () =>
    `✏️ Send two colours: the <b>background</b> first, then the <b>highlight</b>. Like this:\n<code>#F2E8DC #A84F2C</code>`,
  themeBad: (why: string) =>
    why === 'contrast'
      ? `Those two colours are too close, so highlights would be hard to see. Pick a darker or lighter highlight and send both again.`
      : `I need two colours like <code>#F2E8DC #A84F2C</code> (background first, then highlight). Try again.`,
  themeSaved: (label: string) => `🎨 Video theme: <b>${esc(label)}</b>`,
  starting: () => `🎬 Making your first test video. It won't be posted. I'll send it here in a few minutes.`,
  dryRunReady: (firstPost: string) => `Here's your first video! This is a test, it was <b>not</b> posted.\nYour first real post is <b>${esc(firstPost)}</b>.`,
  allSet: () => `🎉 Your channel is running! Use /stats, /top, /report and /dashboard to follow how it goes, and /settings to change things.`,

  // Daily
  approval: (time: string, caption: string, username: string, privacySet: boolean) =>
    `🎬 <b>Ready for ${esc(time)}</b>\n${esc(caption)}\n\nPosting to @${esc(username)}. ${privacySet ? '' : 'Pick who can see it, then tap Post.'}\n<i>By posting, you agree to TikTok's Music Usage Confirmation. This video is labeled as AI-generated.</i>`,
  pickPrivacyFirst: () => `Pick who can see it first (TikTok needs you to choose).`,
  approved: (when: string) => `✅ Approved. It will post ${esc(when)}.`,
  skipped: () => `⏭ Skipped. Nothing was posted.`,
  regenerating: () => `🔄 Making a new version…`,
  regenLimit: () => `That slot was already remade 3 times. Skip it or post one of them.`,
  posted: (caption: string, privacy: string) => `✅ <b>Posted!</b>${privacy === 'SELF_ONLY' ? ' (private: only you can see it until TikTok approves the app)' : ''}\n${esc(caption)}`,
  failed: (when: string, why: string) => `❌ Your ${esc(when)} video failed: ${esc(why)}`,
  reconnect: () => `⚠️ Your TikTok login expired. Connect again to keep posting.`,

  // Commands
  help: () =>
    [
      '<b>Commands</b>',
      '',
      '🎬 /videos  watch your videos',
      '✋ /mode  full auto or review first',
      '📈 /stats  today and the last 30 days',
      '🏆 /top  your best videos',
      '🗒 /report  weekly report',
      '📊 /dashboard  full analytics',
      '⚙️ /settings  niche, goal, schedule, theme',
      '📣 /marketing  videos for your business',
      '⏸ /pause  and  ▶️ /resume  posting',
      '🗑 /disconnect  delete your data',
      '',
      'Tap /menu any time for the buttons.',
    ].join('\n'),
  unknownCommand: () => `I don't know that command. Tap /menu for the buttons, or /help for the list.`,
  home: (h: {username: string | null; mode: Mode; paused: boolean; next: string | null; marketing: boolean}) =>
    [
      `🏠 <b>Pip Studio</b>${h.username ? `  ·  @${esc(h.username)}` : ''}`,
      '',
      `Posting: ${h.mode === 'auto' ? '⚡ Full auto' : '✋ Review and approve'}`,
      h.paused ? 'Status: ⏸ Paused' : `Next post: ${h.next ? esc(h.next) : 'not planned yet'}`,
      `Videos: ${h.marketing ? '📣 Marketing' : '🎓 Explainers'}`,
    ].join('\n'),
  notReady: () => `Finish setup first with /start.`,
  paused: () => `⏸ Paused. No videos will be made or posted until you send /resume.`,
  resumed: () => `▶️ Resumed. Your next video is on the way.`,
  pausedQuota: () => `⏸ Pip Studio used most of its free GitHub minutes this month, so posting is paused until the 1st. Sorry!`,
  videosList: (total: number, mode: Mode, page: number, pages: number) =>
    `🎬 <b>Your videos</b> (${total})${pages > 1 ? ` · page ${page + 1} of ${pages}` : ''}\nPosting: ${mode === 'auto' ? '⚡ <b>Full auto</b> (I post by myself and send you each video after)' : '✋ <b>Review and approve</b> (nothing posts until you tap Post)'}\n\nTap a video to watch it.`,
  noVideos: (mode: Mode) =>
    `🎬 <b>Your videos</b>\nNo videos yet. Your first one will show up here once it is made.\n\nPosting: ${mode === 'auto' ? '⚡ Full auto' : '✋ Review and approve'}`,
  videoCard: (v: {status: string; title: string; when: string; views: number | null; error: string | null}) =>
    `${v.status}\n<b>${esc(v.title)}</b>\n${esc(v.when)}${v.views != null ? ` · 👁 ${fmtNum(v.views)} views` : ''}${v.error ? `\n<i>${esc(v.error)}</i>` : ''}`,
  videoNotMade: (when: string) => `🗓 This video is not made yet. It will be ready before ${esc(when)}.`,
  videoGone: () => `This video's file was deleted, so there is nothing to play. (Skipped videos are removed after 2 days.)`,
  modeNow: (mode: Mode) =>
    `<b>Posting mode</b>\n\n${mode === 'auto' ? '⚡ <b>Full auto</b> is on.' : '✋ <b>Review and approve</b> is on.'}\n\n✋ <b>Review and approve</b>: I send each video here first with Post / Skip / Regenerate.\n⚡ <b>Full auto</b>: I post by myself at your times and send you each video after.`,
  modeSwitched: (mode: Mode, waiting: number) =>
    mode === 'auto'
      ? `⚡ Full auto is on. From now on I post by myself and send you each video after.${waiting ? ` The ${waiting === 1 ? 'video' : `${waiting} videos`} already waiting still ${waiting === 1 ? 'needs' : 'need'} your OK.` : ''}`
      : `✋ Review and approve is on. Every new video comes here first, and nothing posts until you tap Post.`,
  settingsMenu: () => `⚙️ <b>Settings</b>\nWhat do you want to change? (Your character is locked so it always looks the same.)`,
  saved: () => `✅ Saved.`,
  newCharacterWarn: () => `This makes a new character. Your current one stays saved, but new videos will use the new one. Continue?`,
  disconnectAsk: () => `This removes your TikTok and Claude connections and deletes all your data (videos list, stats, character). This can't be undone. Are you sure?`,
  disconnected: () => `🗑 Done. Your tokens are removed and your data is deleted. Send /start if you ever want to come back.`,
  dashboard: () => `📊 Open your dashboard:`,
  stats: (s: {followers: number; dFollowers: number; views: number; likes: number; engagement: number; videosToday: number; tooSmall: boolean}) =>
    `📊 <b>Today</b>\nFollowers: <b>${fmtNum(s.followers)}</b> (${s.dFollowers >= 0 ? '+' : ''}${fmtNum(s.dFollowers)})\nViews: <b>${fmtNum(s.views)}</b> · Likes: <b>${fmtNum(s.likes)}</b>\nEngagement: <b>${fmtPct(s.engagement)}</b>\nVideos posted today: ${s.videosToday}${s.tooSmall ? '\n\n<i>Still early: numbers get more useful after 15+ videos.</i>' : ''}`,
  noData: () => `No numbers yet. They show up a few hours after your first post.`,

  // Marketing videos
  askBusiness: () =>
    `📣 <b>Marketing videos</b>\n\nEvery day you send me 3 TikToks you like, and the next day I make 3 videos in the same style for your business and post them.\n\nFirst, tell me about your business in one message:\n• name\n• what you sell\n• who it's for\n• your offer or price (only real ones)\n• your link (optional)\n\n<i>Example: "Bloom Bakery, fresh sourdough and birthday cakes for families and offices. Free delivery on orders over 30 dollars. bloombakery.com"</i>`,
  businessTooShort: () => `Tell me a bit more (at least a sentence): the name, what you sell and who it's for.`,
  businessSaved: (link: string | null) => `✅ Saved your business info.${link ? `\nVideos will point viewers to the link in your bio (${esc(link)}).` : ''}`,
  askRefs: (day: string, times: string[]) =>
    `🎬 <b>Send 3 reference videos</b> for ${esc(day)}\n\nUpload 3 TikToks or Reels you like (save them on TikTok, then send them here as videos). I'll copy their style and pacing, never their words or brand.\n\nThey post at ${times.map(esc).join(', ')}.\n<i>Max 20 MB and 3 minutes each.</i>`,
  refGot: (n: number) => `✅ Got reference ${n} of 3.${n < 3 ? ' Send the next one.' : ''}`,
  refBad: (why: 'too_big' | 'too_long' | 'not_video') =>
    why === 'too_big' ? `That file is over 20 MB, which Telegram won't let me download. Send a shorter or smaller version.` : why === 'too_long' ? `That one is longer than 3 minutes. Send a short video (under 3 minutes).` : `That isn't a video. Send the reference as a video file.`,
  refNeedVideo: (n: number) => `Send the reference as a video file (${n} of 3 so far).`,
  refDuplicate: () => `You already sent that one. Send a different video.`,
  notMarketing: () => `Got a video, but marketing videos are off. Send /marketing to turn them on.`,
  refLink: () => `I can't open TikTok links. Save the video on TikTok (Share → Save video), then send the file here.`,
  askNotes: () => `✏️ <b>What should I change?</b>\nTell me what to say or show, e.g. "mention our 20% weekend offer, make it funny, show how to order on WhatsApp".\n\nOr tap No changes.`,
  briefSaved: (day: string, times: string[]) => `✅ <b>All set for ${esc(day)}.</b>\nI'll make 3 videos like your references and post them at ${times.map(esc).join(', ')}. You'll get each one to approve first if you're in approval mode.`,
  dailyRefs: (day: string) => `📣 Time for tomorrow's references (${esc(day)}). Send 3 videos you like, or reuse today's.`,
  reusedRefs: (day: string) => `👍 I'll reuse your last references for ${esc(day)}.`,
  noRefsYet: () => `I need your 3 reference videos before I can make marketing videos. Send /marketing to add them.`,
  marketingOff: () => `✅ Back to explainer videos. Pick your niche:`,
  marketingMenu: (business: string, lastDay: string | null) =>
    `📣 <b>Marketing videos are on</b>\n\nBusiness: ${esc(business.slice(0, 200))}${business.length > 200 ? '…' : ''}\n${lastDay ? `Latest references: for ${esc(lastDay)}` : 'No references yet.'}`,
};
