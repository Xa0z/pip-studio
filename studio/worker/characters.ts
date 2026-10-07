/** Claude designs 3 original characters; we check the code, save it, and render preview sheets. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../../src/config.js';
import {extractJson} from '../../src/plan.js';
import {checkCharacterCode} from '../lib/charcheck.js';
import {KOKORO_VOICES} from '../bot/bot.js';
import type {Ask} from './planner.js';

export const GENERATED_DIR = path.join(ROOT, 'remotion', 'character', 'generated');
export const REGISTRY = path.join(ROOT, 'remotion', 'character', 'registry.tsx');

export type CharacterDraft = {name: string; code: string};

const pipSource = () => fs.readFileSync(path.join(ROOT, 'remotion', 'character', 'Pip.tsx'), 'utf8');

export const characterSystem = () => `You design ORIGINAL cartoon characters for animated TikTok videos, as React components that draw plain SVG.

Rules for every character:
- Fully original. Never copy or imitate a famous or copyrighted character, mascot or logo. If the description names one, return {"refused": "<name>"}.
- One file, TypeScript + JSX. Allowed imports ONLY:
    import React from 'react';   (you may also import {useId, useMemo} from 'react')
    import {useCurrentFrame, useVideoConfig, interpolate, spring} from 'remotion';
- Export: export const Character: React.FC<{expression?: 'happy'|'surprised'|'thinking'|'excited'|'wink'; pose?: 'idle'|'pointing'|'waving'|'jumping'; talking?: boolean}>
- Draw inside <svg viewBox="0 0 400 480" width="100%" style={{overflow: 'visible'}}>. Character centered, feet near y=440.
- Only SVG tags (g, path, circle, ellipse, rect, line, polygon, polyline, defs, linearGradient, radialGradient, stop, clipPath, mask, filter, feGaussianBlur, feOffset, feMerge, feMergeNode, feDropShadow). No <text>, <image>, <foreignObject>, <use>, no href/src attributes, no event handlers, no URLs.
- No fetch, timers, window, document, eval, "new", while loops, obj[key] access with anything but a number index, or {...spread} attributes. Colors and proportions are constants at the top.
- Expressions must look clearly different (eyes and mouth). Poses move the arms (pointing: one arm out, waving: one arm waves, jumping: hops with squash and stretch).
- Always alive: gentle float, eyes blink every few seconds, mouth opens and closes while talking=true. Animate only from useCurrentFrame()/fps.
- Use useId() for gradient/clip ids so several copies can be on screen.
- Bold, simple, friendly shapes that read well on a phone. 3 to 6 colors.

Here is an existing character (Pip) for the props and animation style. Do NOT make it look like Pip:
---
${pipSource()}
---`;

export const characterPrompt = (description: string) =>
  `Make 3 clearly different versions of this character: "${description}".
Each version gets a short, original, easy name (one word).
Also pick 3 Kokoro voices that could fit, from: ${KOKORO_VOICES.join(', ')}. Pick 3 different ones.
Return ONLY JSON: {"characters": [{"name": string, "code": string}, {"name": string, "code": string}, {"name": string, "code": string}], "voices": [string, string, string]}`;

export class CharacterRefused extends Error {}

/** Asks Claude for 3 characters; fixes any that fail the safety check (2 more rounds). */
export async function designCharacters(description: string, ask: Ask): Promise<{drafts: CharacterDraft[]; voices: string[]}> {
  const system = characterSystem();
  const text = await ask(characterPrompt(description), system);
  const json = extractJson(text);
  if (json.refused) throw new CharacterRefused(String(json.refused));
  let drafts: CharacterDraft[] = (json.characters ?? []).slice(0, 3).map((c: any) => ({name: String(c.name ?? 'Buddy').replace(/[^A-Za-z0-9 -]/g, '').slice(0, 20) || 'Buddy', code: String(c.code ?? '')}));
  const voices = ((json.voices ?? []) as string[]).filter((v) => KOKORO_VOICES.includes(v));
  for (let round = 0; round < 2; round++) {
    const bad = drafts.map((d, i) => ({i, errors: checkCharacterCode(d.code)})).filter((x) => x.errors.length);
    if (!bad.length) break;
    for (const b of bad) {
      const fix = await ask(
        `This character code for "${description}" (name ${drafts[b.i].name}) breaks these rules:\n- ${b.errors.join('\n- ')}\n\nCode:\n${drafts[b.i].code}\n\nReturn ONLY JSON {"name": string, "code": string} with the fixed code.`,
        system,
      );
      try {
        const f = extractJson(fix);
        drafts[b.i] = {name: drafts[b.i].name, code: String(f.code ?? '')};
      } catch {
        /* keep, it will be dropped below */
      }
    }
  }
  drafts = drafts.filter((d) => checkCharacterCode(d.code).length === 0);
  if (!drafts.length) throw new Error('Claude could not make a character that passes the safety check');
  const fallback = ['af_heart', 'am_puck', 'bf_emma'];
  return {drafts, voices: [...new Set([...voices, ...fallback])].slice(0, 3)};
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const registryKey = (id: string) => `c_${id.replace(/-/g, '').slice(0, 16)}`;

/** Writes character files and a registry that includes them (Pip is always included). */
export function writeRegistry(chars: {key: string; code: string}[]) {
  // Tests point this somewhere else so they never touch the real Remotion folder.
  const base = process.env.STUDIO_REGISTRY_DIR;
  const GENERATED_DIR_ = base ? path.join(base, 'generated') : GENERATED_DIR;
  const REGISTRY_ = base ? path.join(base, 'registry.tsx') : REGISTRY;
  fs.mkdirSync(GENERATED_DIR_, {recursive: true});
  const lines = ["// Generated by Pip Studio's worker before a render. Do not edit or commit.", "import type React from 'react';", "import {Pip, type PipProps} from './Pip';"];
  for (const c of chars) {
    fs.writeFileSync(path.join(GENERATED_DIR_, `${c.key}.tsx`), c.code);
    lines.push(`import {Character as ${c.key}} from './generated/${c.key}';`);
  }
  lines.push('', 'export type CharacterProps = PipProps;', '', 'export const CHARACTERS: Record<string, React.FC<CharacterProps>> = {', '  pip: Pip,');
  for (const c of chars) lines.push(`  ${c.key}: ${c.key} as React.FC<CharacterProps>,`);
  lines.push('};', '');
  fs.writeFileSync(REGISTRY_, lines.join('\n'));
}
