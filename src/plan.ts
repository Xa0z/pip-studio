import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {config} from './config.js';
import {isRepeatTopic} from './history.js';
import {log} from './log.js';
import {Category, ICONS, LAYOUTS, LayoutName, Plan, PlanSchema, countWords} from './schema.js';
import {withRetry} from './util.js';
const MAX_ATTEMPTS = 3;

const SYSTEM = `You write scripts for "Pip Explains", a TikTok channel. Pip is a small, friendly orange robot who shares one mind-blowing, TRUE fact per video.
Audience: curious English speakers aged 16 to 35. Tone: friendly, excited, simple words, short sentences. Every video is exactly 62 seconds.

ACCURACY RULES (most important):
- Only use facts that are well established and widely documented (NASA, ESA, NOAA, NIH, Britannica, National Geographic, peer-reviewed textbook science).
- No myths, no exaggerations, no made-up or rounded-up numbers. Use numbers exactly as the source gives them, and say "about" when the source gives an approximate value.
- Never write "scientists say" or "studies show" unless you name what you mean in "source".
- If you are not fully sure about a fact or a number, pick a different topic.
- "source" names where Ahmad can check the main fact (e.g. "NASA Solar System Exploration: Venus", "Encyclopaedia Britannica: Bioluminescence"). It is never shown in the video.

SCRIPT STRUCTURE:
- 8 to 12 scenes. Pip's narration across all scenes is 150 to 165 words in total (about 60 seconds of speech).
- Scene 1, role "hook": max 9 words, said in under 3 seconds. A surprising statement, e.g. "Your body glows in the dark. Seriously."
- Then "fact" scenes: one main fact explained simply, then 2 to 3 supporting details. Each fact scene is 1 to 3 short sentences, max 22 words, so no scene runs longer than 8 seconds.
- Second to last scene, role "recap": a quick recap of the main fact, with 2 to 3 "bullets" (max 5 words each).
- Last scene, role "cta": Pip asks viewers to follow, e.g. "Follow for a new fact every day!" (max 12 words).
- Write numbers in narration the way they are spoken naturally ("about one hundred million" is fine, "100,000,000" is also fine). Do not use symbols like "%" or "km" in narration: write "percent", "kilometers".

ON-SCREEN TEXT:
- "headline": short text (max 6 words) summing up the scene. "highlight": 0 to 2 key words copied exactly from the headline; they are shown in orange.
- Every fact scene has a "visual". Layouts:
  bigNumber {value, decimals?, prefix?, unit, label, icon} - a number that counts up. The number must match the narration.
  compare {unit, items:[{label, value, icon}] (2-4)} - bars comparing real values with the same unit.
  iconGrid {icon, count (1-30), label} - "count" copies of an icon, label follows the number ("hearts in an octopus").
  orbit {center, satellite, label} - one thing going around another (also good for cycles).
  steps {steps:[{icon, text (max 22 chars)}] (2-4)} - a process in order.
  spotlight {icon, caption (max 60 chars)} - one big icon and a short caption.
- Never use the same layout in two scenes in a row. Use at least 4 different layouts per video.
- Icons must be one of: ${ICONS.join(', ')}.
- Pip: pick "expression" (happy, surprised, thinking, excited, wink) and "pose" (idle, pointing, waving, jumping) to match each scene. Hook: surprised or excited. CTA: waving.

CAPTION AND HASHTAGS:
- "caption": max 150 characters, a question or hook that invites comments. No hashtags inside the caption.
- "hashtags": 3 to 5, lowercase, mix niche and broad (e.g. #space #didyouknow #science #facts).

ORIGINALITY: only original writing. No brands, logos, songs, movie or game characters, or other creators.

OUTPUT: return ONLY one JSON object, no markdown fences, no comments, with exactly these keys:
{
  "category": "space" | "human_body" | "animals" | "nature" | "physics",
  "topic": string (short unique name of the topic),
  "mainFact": string,
  "supportingDetails": [string, string] or [string, string, string],
  "source": string,
  "caption": string,
  "hashtags": [string],
  "scenes": [{
    "role": "hook" | "fact" | "recap" | "cta",
    "narration": string,
    "headline": string,
    "highlight": [string],
    "pip": {"expression": string, "pose": string},
    "visual": {...one of the layouts, with a "layout" key} (required for fact scenes, leave out for others),
    "bullets": [string] (recap scene only)
  }]
}`;

export const extractJson = (text: string) => {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found in the reply');
  return JSON.parse(t.slice(start, end + 1));
};

/** Who pays for Claude: the owner's Claude Code token, or a user's own API key. */
export type ClaudeCredential = {kind: 'oauth_token' | 'api_key'; secret: string};

/** Claude Code headless (uses your Claude subscription, no API bill). */
export async function viaClaudeCode(prompt: string, system = SYSTEM, oauthToken?: string, images: string[] = []): Promise<string> {
  // With images, Claude Code may only use its Read tool, and only on the folder that holds them.
  const tools = images.length ? ['--tools', 'Read', '--allowedTools', 'Read', '--add-dir', ...new Set(images.map((i) => path.dirname(i)))] : ['--tools', ''];
  const args = ['-p', '--output-format', 'json', '--model', config.CLAUDE_MODEL, '--system-prompt', system, ...tools, '--no-session-persistence'];
  if (images.length) prompt = `${prompt}\n\nLook at these image files with the Read tool before you answer (they are frames from the video, in order):\n${images.map((i) => `- ${i}`).join('\n')}`;
  const env = {...process.env};
  if (oauthToken) {
    env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
    delete env.ANTHROPIC_API_KEY;
  }
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', args, {stdio: ['pipe', 'pipe', 'pipe'], env});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => reject(new Error(`Could not start Claude Code (is it installed?): ${e.message}`)));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) reject(new Error(`claude exited with code ${code}: ${stderr.slice(-500)}`));
      else resolve(stdout);
    });
    child.stdin.end(prompt);
  });
  let res: {result?: string; is_error?: boolean; subtype?: string};
  try {
    res = JSON.parse(out);
  } catch {
    throw new Error(`Claude Code returned non-JSON output: ${out.slice(0, 300)}`);
  }
  if (res.is_error || typeof res.result !== 'string') throw new Error(`Claude Code error: ${res.subtype ?? ''} ${String(res.result ?? '').slice(0, 300)}`);
  return res.result;
}

/** Paid API: used when ANTHROPIC_API_KEY is set, or with a user's own key in Pip Studio. */
export async function viaApi(prompt: string, system = SYSTEM, apiKey?: string, images: string[] = []): Promise<string> {
  const {default: Anthropic} = await import('@anthropic-ai/sdk');
  const client = new Anthropic({maxRetries: 3, ...(apiKey ? {apiKey} : {})});
  // Server-side fallback: if the model declines, the API retries on a fallback model in the same call.
  const stream = client.beta.messages.stream({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    max_tokens: 32000,
    system,
    thinking: {type: 'adaptive'},
    output_config: {effort: 'high'},
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: images.length
          ? [
              ...images.map((file) => ({type: 'image' as const, source: {type: 'base64' as const, media_type: 'image/jpeg' as const, data: fs.readFileSync(file).toString('base64')}})),
              {type: 'text' as const, text: prompt},
            ]
          : prompt,
      },
    ],
  });
  const res = await stream.finalMessage();
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write this script');
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

/** Calls Claude with an explicit credential (Pip Studio) or the environment (Pip Explains). */
export const callClaudeWith = (prompt: string, system: string, cred?: ClaudeCredential, images: string[] = []) =>
  cred
    ? cred.kind === 'api_key'
      ? viaApi(prompt, system, cred.secret, images)
      : viaClaudeCode(prompt, system, cred.secret, images)
    : process.env.ANTHROPIC_API_KEY
      ? viaApi(prompt, system, undefined, images)
      : viaClaudeCode(prompt, system, undefined, images);

const callClaude = (prompt: string) => callClaudeWith(prompt, SYSTEM);

type Check = (plan: Plan) => string[];

/** Asks Claude until the JSON passes zod and the extra checks (max 3 tries, with the exact errors). */
async function askForPlan(basePrompt: string, extraCheck: Check): Promise<Plan> {
  let prompt = basePrompt;
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    log.info(`Asking Claude (${process.env.ANTHROPIC_API_KEY ? 'API' : 'Claude Code'}), attempt ${attempt}/${MAX_ATTEMPTS}`);
    const text = await withRetry('Claude', callClaude.bind(null, prompt), 2, 5000);
    let errors: string[] = [];
    try {
      const parsed = PlanSchema.safeParse(extractJson(text));
      if (parsed.success) {
        errors = extraCheck(parsed.data);
        if (!errors.length) return parsed.data;
      } else {
        errors = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      }
    } catch (e) {
      errors = [`Invalid JSON: ${(e as Error).message}`];
    }
    lastErrors = errors;
    log.warn(`Plan rejected: ${errors.join(' | ')}`);
    prompt = `${basePrompt}

Your previous answer was:
${text.trim()}

It has these problems:
- ${errors.join('\n- ')}
Fix all of them and return the full corrected JSON object only.`;
  }
  throw new Error(`Claude could not produce a valid plan after ${MAX_ATTEMPTS} tries: ${lastErrors.join(' | ')}`);
}

export type PlanRequest = {
  episode: number;
  category: Category;
  pastTopics: string[];
  startLayout: LayoutName;
};

export async function planVideo(req: PlanRequest): Promise<Plan> {
  const recent = req.pastTopics.slice(-300);
  const prompt = `Write video "Did you know? #${req.episode}".
Category: ${req.category} (you must use exactly this category).
Use "${req.startLayout}" as the layout of the first fact scene.
Topics already used (never repeat these or anything very close to them):
${recent.length ? recent.map((t) => `- ${t}`).join('\n') : '- (none yet)'}`;

  const check: Check = (p) => {
    const errs: string[] = [];
    if (p.category !== req.category) errs.push(`category must be "${req.category}"`);
    const dup = isRepeatTopic(p.topic, recent);
    if (dup) errs.push(`topic "${p.topic}" is too close to an earlier topic "${dup}"; pick a different topic`);
    return errs;
  };
  return askForPlan(prompt, check);
}

/** Asks Claude to fix a plan (e.g. too long or too short when spoken) while keeping the topic. */
export async function revisePlan(plan: Plan, problems: string[]): Promise<Plan> {
  const words = plan.scenes.reduce((n, s) => n + countWords(s.narration), 0);
  const prompt = `Here is a video plan (narration is ${words} words):
${JSON.stringify(plan)}

When it was read aloud, these problems came up:
- ${problems.join('\n- ')}

Rewrite it to fix them. Keep the same topic, category, facts, source and accuracy. Keep all the rules.
Return the full corrected JSON object only.`;
  const check: Check = (p) => (p.category !== plan.category ? [`category must stay "${plan.category}"`] : []);
  return askForPlan(prompt, check);
}

export const layoutForEpisode = (episode: number): LayoutName => LAYOUTS[episode % LAYOUTS.length];
