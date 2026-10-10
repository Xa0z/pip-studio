/**
 * Step 2 of a director video: Claude writes the whole video as one Remotion file ("episode"),
 * from the brief Claude wrote in step 1 (studio/lib/director-schema.ts) and the beats timed to
 * the real voice. The file is checked (studio/lib/charcheck.ts and a TypeScript check, neither
 * runs it) and Claude gets the exact errors to fix. If it still fails, the video falls back to
 * the scene layouts, so a post is never lost because of the code.
 */
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {ROOT} from '../../src/config.js';
import {ICONS, type TimedScene, type Word} from '../../src/schema.js';
import type {VideoTheme} from '../../src/themes.js';
import {FPS} from '../../src/timeline.js';
import {checkEpisodeCode} from '../lib/charcheck.js';
import type {StudioPlan} from '../lib/plan-schema.js';
import {redact} from '../lib/redact.js';
import type {Ask} from './planner.js';

const run = promisify(execFile);

export const EPISODE_DIR = path.join(ROOT, 'remotion', 'director');
const dirs = () => {
  // Tests point this somewhere else so they never touch the real Remotion folder.
  const base = process.env.STUDIO_EPISODE_DIR ?? EPISODE_DIR;
  return {base, generated: path.join(base, 'generated'), registry: path.join(base, 'registry.tsx')};
};

/** Plan fields only director plans have. */
export type DirectorExtras = {format?: string; brief?: string; scenes: (StudioPlan['scenes'][number] & {idea?: string; icon?: string})[]};

// ---------- what the animator is told ----------

const SKILL_DIR = path.join(ROOT, '.claude', 'skills', 'remotion-best-practices', 'remotion-markup');
/** Rule files from the official Remotion skill (remotion-dev/skills) that apply to a code-only render. */
const SKILL_FILES = ['timing.md', '3d.md', 'text-highlights.md'];

const stripFrontmatter = (s: string) => s.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

/** The parts of the Remotion skill this pipeline can use (the Studio, media and font advice does not apply here). */
export function skillRules(): string {
  const parts: string[] = [];
  try {
    const ref = fs.readFileSync(path.join(SKILL_DIR, 'REFERENCE.md'), 'utf8');
    const m = /## General rules\n([\s\S]*?)\n## /.exec(ref);
    if (m) parts.push(`## General rules\n${m[1].trim()}`);
  } catch {
    /* the skill is optional; the rules below still hold */
  }
  for (const f of SKILL_FILES) {
    try {
      parts.push(stripFrontmatter(fs.readFileSync(path.join(SKILL_DIR, f), 'utf8')));
    } catch {
      /* skip a missing file */
    }
  }
  return parts.join('\n\n');
}

const kitSource = () => fs.readFileSync(path.join(EPISODE_DIR, 'kit.tsx'), 'utf8');

export const coderSystem = () => `You are a senior motion designer who animates in code with Remotion (React). You write ONE file that draws a whole short vertical video (1080 x 1920, 30 fps) from a creative brief, timed to a voice that is already recorded.

THIS PIPELINE (read carefully, it overrides general Remotion advice):
- The file is rendered straight to MP4 on a server. There is no Studio and nobody edits it: ignore advice about Studio editing, Interactive components, premounting, connected compositions, staticFile, fonts and media components.
- Export exactly: export const Episode: React.FC = () => { ... }  It fills the whole frame. Use <AbsoluteFill> and <Sequence from={...} durationInFrames={...}> (or <Series>) to place each part in time.
- The host draws the background colour, plays the voice and draws the spoken-word captions in the band y = 1300 to 1520. Keep important text and the character's face out of that band. The top 140 px and bottom 260 px are covered by TikTok's buttons: keep text out of them.
- Timing: useBeats() gives every beat with "from" and "durationInFrames" in absolute frames. Time each beat's visuals to its beat (<Sequence from={beats[i].from} durationInFrames={beats[i].durationInFrames}>), and time key moments to the words (useWords(): seconds from the start; frame = Math.round(seconds * 30)).
- Colours: ONLY from useTheme() (bg, surface, track, line, ink, inkMuted, accent, accent2, accentSoft, marker, onAccent). Text on accent uses onAccent. No other hex colours except pure white or black for small details.
- Text: fontFamily FONT from the kit, weights 600 to 800, big and bold (headlines 72 to 110 px, labels at least 40 px). Short words on screen; the captions already show what is said.
- The character: <Character expression pose width /> from the kit (it already moves its mouth with the voice). Keep it on screen most of the time, place and move it as the brief says (wrap it in an absolutely positioned div). Never redraw or restyle it. If useHasCharacter() is false, leave it out.
- 3D: import {ThreeCanvas} from '@remotion/three' and build from R3F elements (<mesh>, <boxGeometry>, <meshStandardMaterial>, lights...). Give it width and height props. Flat matte look: meshStandardMaterial with roughness 0.6 to 1 or meshToonMaterial, theme colours, ambient + directional light. Only ONE ThreeCanvas on screen at a time, each inside its own Sequence. Animate the camera through props driven by useCurrentFrame() (for example a group that moves, or the camera position prop recomputed each frame).
- Allowed imports ONLY:
    import React, {useMemo, useId, Fragment} from 'react';
    import {AbsoluteFill, Sequence, Series, Loop, Freeze, useCurrentFrame, useVideoConfig, interpolate, interpolateColors, spring, measureSpring, Easing, random} from 'remotion';
    import {ThreeCanvas} from '@remotion/three';
    import {DoubleSide, BackSide, FrontSide, MathUtils} from 'three';
    import {Character, Icon, KineticText, Highlighted, Media, useTheme, FONT, useBeats, useWords, useHasCharacter, CANVAS, type Beat} from '../kit';
- Allowed tags: div, span, p, h1, h2, h3, strong, em, b, i, small, br, ul, ol, li; SVG drawing tags (svg, g, path, circle, rect, line, polygon, text, linearGradient...); R3F tags (group, mesh, *Geometry, *Material, *Light, fog, color). Components you define in the file, and the imported ones.
- Not allowed (the file is rejected): fetch, timers, window, document, eval, "new", while loops, obj[key] with anything but a number index, {...spread} JSX attributes, refs, event handlers, href/src attributes, URLs, CSS animation or transition (animate only from useCurrentFrame()), useFrame from R3F, <img>, <video>, <audio>, <primitive>.
- Every frame must be deterministic: use random('seed') from remotion, never Math.random().
- Icons: <Icon name size /> with one of: ${ICONS.join(', ')}.
- Library photos: <Media beat={i} width height style /> shows the photo or clip found for beat i (an icon when none was found).

QUALITY BAR: it must look like a skilled human editor made it, not like a slideshow and not "AI-looking". Strong composition, a clear focal point in every frame, nothing static for more than about a second (subtle camera drift or scale), purposeful motion with easing and springs, staggered entrances, clean cuts or match cuts between beats. No glows, sparkles, starfields, lens flares or rainbow gradients.

REMOTION RULES (from the official remotion-best-practices skill):
${skillRules()}

THE KIT ('../kit'), for reference:
---
${kitSource()}
---

OUTPUT: only the complete file in one \`\`\`tsx code block. No explanation.`;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function coderPrompt(o: {plan: StudioPlan & Partial<DirectorExtras>; scenes: TimedScene[]; words: Word[]; theme: VideoTheme; characterName: string | null; totalFrames: number}) {
  const beats = o.scenes.map((s, i) => {
    const said = o.words.filter((w) => w.start * FPS >= s.from - 1 && w.start * FPS < s.from + s.durationInFrames - 1);
    const extra = s as TimedScene & {idea?: string; icon?: string};
    const media = s.visual?.layout === 'media' ? (s.visual.src ? `real ${s.visual.kind} available via <Media beat={${i}} />: "${s.visual.caption}"` : `no photo was found: <Media beat={${i}} /> shows the "${s.visual.icon}" icon`) : null;
    return [
      `Beat ${i} (${s.role}) frames ${s.from} to ${s.from + s.durationInFrames - 1} (${r1(s.durationInFrames / FPS)} s)`,
      `  says: "${s.narration}"`,
      `  word times (s): ${said.map((w) => `${w.text}@${r1(w.start)}`).join(' ')}`,
      `  headline: "${s.headline}"${s.highlight.length ? ` highlight: ${s.highlight.join(', ')}` : ''}`,
      extra.idea ? `  idea: ${extra.idea}` : null,
      `  character: ${s.pip.expression}, ${s.pip.pose}${extra.icon ? ` · icon: ${extra.icon}` : ''}`,
      s.bullets?.length ? `  bullets: ${s.bullets.join(' | ')}` : null,
      media ? `  media: ${media}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });
  return `Animate this video.

FORMAT: ${o.plan.format ?? '(free)'}
TOPIC: ${o.plan.topic}

CREATIVE BRIEF:
"""${o.plan.brief ?? 'Make it clear, bold and surprising.'}"""

COLOURS (from useTheme(); never hard-code them): ${Object.entries(o.theme).map(([k, v]) => `${k} ${v}`).join(', ')}
CHARACTER: ${o.characterName ? `${o.characterName} (use <Character />)` : 'none (useHasCharacter() is false)'}
LENGTH: ${o.totalFrames} frames (${r1(o.totalFrames / FPS)} s). The last beat runs to the end.

BEATS (already timed to the voice; useBeats()[i] has the same numbers):
${beats.join('\n\n')}`;
}

// ---------- reading and checking the code ----------

/** The code from Claude's reply: the first ```tsx block, or the whole reply if there is none. */
export function extractCode(text: string): string {
  const m = /```(?:tsx|typescript|ts|jsx)?\s*\n([\s\S]*?)```/.exec(text);
  return (m ? m[1] : text).trim() + '\n';
}

export const episodeKey = (id: string) => `e_${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;

/** Writes the episode file and a registry that includes it (or an empty registry). */
export function writeEpisodeRegistry(entries: {key: string; code: string}[]) {
  const d = dirs();
  fs.mkdirSync(d.generated, {recursive: true});
  const lines = [
    "// Generated by Pip Studio's worker before a render. Do not edit or commit.",
    "import type React from 'react';",
  ];
  for (const e of entries) {
    fs.writeFileSync(path.join(d.generated, `${e.key}.tsx`), e.code);
    lines.push(`import {Episode as ${e.key}} from './generated/${e.key}';`);
  }
  lines.push('', 'export const EPISODES: Record<string, React.FC> = {');
  for (const e of entries) lines.push(`  ${e.key}: ${e.key},`);
  lines.push('};', '');
  fs.writeFileSync(d.registry, lines.join('\n'));
}

/** Type-checks one episode file against the kit (does not run it). Returns the errors. */
export async function typecheckEpisode(code: string, key = `e_check_${process.pid}`): Promise<string[]> {
  // Always next to the real kit, so '../kit' resolves (the folder is git-ignored and the file is removed after).
  const generated = path.join(EPISODE_DIR, 'generated');
  fs.mkdirSync(generated, {recursive: true});
  const file = path.join(generated, `${key}.tsx`);
  const cfg = path.join(generated, `tsconfig.${key}.json`);
  fs.writeFileSync(file, code);
  fs.writeFileSync(cfg, JSON.stringify({extends: path.join(ROOT, 'tsconfig.json'), compilerOptions: {noEmit: true, noUnusedLocals: false}, include: [], files: [file]}));
  try {
    await run(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', cfg], {cwd: ROOT, timeout: 180_000, maxBuffer: 8 * 1024 * 1024});
    return [];
  } catch (e) {
    const out = `${(e as {stdout?: string}).stdout ?? ''}${(e as {stderr?: string}).stderr ?? ''}`;
    const lines = out.split('\n').filter((l) => /error TS\d+/.test(l)).map((l) => l.replace(/^.*generated[\\/]/, '').trim());
    // Only errors in this file matter (its own mistakes); a broken toolchain is not Claude's to fix.
    if (!lines.length) throw new Error(`TypeScript check could not run: ${redact(out || (e as Error).message).slice(0, 300)}`);
    return lines.slice(0, 25);
  } finally {
    fs.rmSync(file, {force: true});
    fs.rmSync(cfg, {force: true});
  }
}

export type EpisodeResult = {code: string; rounds: number} | {code: null; errors: string[]};

/**
 * Asks Claude for the episode, then for fixes (max `fixRounds`) until it passes the safety check
 * and TypeScript. Returns null code (and why) when it never passes, so the caller can fall back.
 */
export async function writeEpisode(o: Parameters<typeof coderPrompt>[0], ask: Ask, fixRounds = 2): Promise<EpisodeResult> {
  const system = coderSystem();
  const prompt = coderPrompt(o);
  let code = extractCode(await ask(prompt, system));
  let errors: string[] = [];
  for (let round = 0; round <= fixRounds; round++) {
    errors = checkEpisodeCode(code);
    if (!errors.length) errors = await typecheckEpisode(code);
    if (!errors.length) return {code, rounds: round};
    if (round === fixRounds) break;
    console.log(`Episode code has ${errors.length} problem(s), asking for a fix: ${errors.slice(0, 3).join(' | ')}`);
    const reply = await ask(`${prompt}\n\nYour file:\n\`\`\`tsx\n${code}\`\`\`\n\nIt was rejected for these problems:\n- ${errors.join('\n- ')}\n\nFix every one and return the complete corrected file in one \`\`\`tsx block.`, system);
    code = extractCode(reply);
  }
  return {code: null, errors};
}

/** Beats without an episode still need something to show in the scene layouts (the fallback). */
export function fallbackScenes<T extends TimedScene>(scenes: T[]): T[] {
  return scenes.map((s) => {
    const icon = ((s as {icon?: string}).icon ?? 'lightbulb') as (typeof ICONS)[number];
    if (s.role === 'recap' && (s.bullets?.length ?? 0) < 2) return {...s, role: 'fact', visual: {layout: 'spotlight', icon, caption: s.headline.slice(0, 60)}};
    if (s.role === 'fact' && !s.visual) return {...s, visual: {layout: 'spotlight', icon, caption: s.headline.slice(0, 60)}};
    return s;
  });
}
