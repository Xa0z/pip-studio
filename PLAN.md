# Pip Explains: plan, JSON schema, Pip design

## Choices (updated with Ahmad's fixes, total cost $0)
- Timezone **Asia/Baghdad**. Posts at 09:00, 15:00, 21:00. Cron at 05:40, 11:40, 17:40 UTC, 20-minute job timeout.
- Writing: **Claude Code headless** (`claude -p --output-format json`) with your Claude plan (`CLAUDE_CODE_OAUTH_TOKEN`). Paid API only if `ANTHROPIC_API_KEY` is set.
- Voice: **Kokoro** (kokoro-js, Apache 2.0) on the runner, one fixed voice (`PIP_VOICE`). Word timings from **Whisper** (whisper.cpp), matched to the script words.
- Length: Kokoro speed 0.9 to 1.1 first, then Claude rewrites (max 4) until speech is 58 to 61 s.
- Alerts: **Telegram**, plus a warning when Actions passes 1700 minutes in a month.
- Video: 1080x1920 (9:16), 30 fps, exactly 1860 frames, H.264 CRF 17, AAC 320k.
- Legal pages on GitHub Pages from `/docs`.

## How a day works
Each slot is its own run (one failure never stops the others): plan (zod, 3 retries with exact errors),
voice (Kokoro per scene, Whisper timings), timeline (frames add up to 1860, no scene over 8 s), render,
real mp4 check (1860 frames), wait for the slot, publish (token refresh, creator_info, allowed privacy,
62 s allowed, chunked FILE_UPLOAD, `is_aigc: true`, poll status, 3 retries with backoff), then history
and encrypted tokens are committed. Videos + JSON are kept 7 days as an Actions artifact.

## JSON schema (zod, in `src/schema.ts`)
What Claude must return (episode number and title are added by code, not by Claude):

```ts
{
  category: "space" | "human_body" | "animals" | "nature" | "physics",
  topic: string,              // short unique name, e.g. "bioluminescence in humans"
  mainFact: string,           // one sentence
  supportingDetails: string[],// 2 to 3
  source: string,             // e.g. "NASA: Sun fact sheet" (never shown in video)
  caption: string,            // max 150 chars, a question or hook
  hashtags: string[],         // 3 to 5, like "#space", lowercase, no spaces
  scenes: Scene[]             // 8 to 12
}

Scene = {
  role: "hook" | "fact" | "recap" | "cta",   // first = hook, last two = recap, cta
  narration: string,          // exact words Pip says in this scene
  headline: string,           // short on-screen text (max ~6 words)
  highlight: string[],        // words in headline shown in orange
  pip: { expression: "happy"|"surprised"|"thinking"|"excited"|"wink",
         pose: "idle"|"pointing"|"waving"|"jumping" },
  visual:                      // one of these layouts
    | { layout: "bigNumber",  value: number, decimals?: number, prefix?: string, unit: string, label: string, icon: Icon }
    | { layout: "compare",    unit: string, items: { label: string, value: number, icon: Icon }[] } // 2 to 4 bars
    | { layout: "iconGrid",   icon: Icon, count: number, label: string }   // count 1 to 30
    | { layout: "orbit",      center: Icon, satellite: Icon, label: string }
    | { layout: "steps",      steps: { icon: Icon, text: string }[] }     // 2 to 4 steps
    | { layout: "spotlight",  icon: Icon, caption: string }               // big icon + text card
}
Icon = one of ~40 built-in drawn icons (sun, planet, moon, star, rocket, heart, brain, eye,
bone, dna, drop, leaf, tree, flower, fish, bird, paw, octopus, bee, atom, bolt, magnet,
mountain, volcano, wave, snowflake, fire, clock, thermometer, cell, ...)
```
Whole-script rules checked in code: 150 to 165 words total, hook narration max 9 words,
CTA mentions following, no two scenes in a row use the same layout, hashtags start with `#`.

## Pip design (`remotion/character/Pip.tsx`, the only place Pip is drawn)
- Round orange body `#FF7A1A`, with a soft darker underside shade (same orange, darker tint) for depth.
- Dark navy face screen `#1B1F3B`, rounded rectangle, inside the body.
- Two big glowing cyan eyes `#3DF5FF` with a soft glow, plus a small cyan mouth bar on the screen.
- One short antenna on top with a yellow light ball `#FFD23F` that blinks.
- Two small round arms (orange) on the sides.
- Colors and proportions are constants in the file. Props change only animation:
  - `expression`: happy (curved smiling eyes), surprised (big round eyes, "o" mouth), thinking (one eye squints, eyes look up), excited (star-sparkle eyes, wide smile), wink (one eye closed).
  - `pose`: idle (arms down, gentle sway), pointing (right arm raised to the side), waving (left arm waves), jumping (hops with squash and stretch).
  - `talking`: screen and mouth pulse while a word is being spoken (driven by the word timings).
- Always: floats up and down gently, antenna light blinks, eyes blink every few seconds.
- Placement: big and centered in the hook, small in the top corner during facts, big again in the CTA.

## Look
- Background: navy `#0B1030` to purple `#3A1C6B` gradient with slowly drifting, twinkling stars (same seed every video so it feels like one world).
- Font: **Fredoka** (bold, rounded) from `@remotion/google-fonts`. White text, orange highlights.
- Subtitles: centered, 3 words at a time, the current word in yellow `#FFD23F`, gentle pop.
- 6 layouts above. Code makes sure no layout repeats back to back, and each video starts its layout order from a different place.
- Music: a random track from `assets/music` at 10% volume, looped. No files there = no music.

## Things only Ahmad can do (exact steps in README.md)
- Create the GitHub repo, turn on Pages, add the secrets.
- Make the TikTok developer app, run `npm run tiktok:login` and `npm run tiktok:check` once.
- Run `claude setup-token`, make the Telegram bot.
- Pick Pip's voice from the samples.
- Submit the TikTok app for audit. Until then every post is private.
