/**
 * Canned Claude answers for tests and the local simulation (no real Claude calls).
 * The fake "ask" looks at the prompt and returns the matching fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {countWords} from '../../src/schema.js';
import type {Ask} from '../worker/planner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Variant = {name: string; fur: string; belly: string; ear: string; eye: string; head: number; tail: number};

export const FOX_VARIANTS: Variant[] = [
  {name: 'Nova', fur: '#FF8A3D', belly: '#FFF1E0', ear: '#3B1F14', eye: '#2A1B3D', head: 1, tail: 1},
  {name: 'Comet', fur: '#F5B041', belly: '#FFFDF5', ear: '#7A3E12', eye: '#1E2A4A', head: 1.12, tail: 0.8},
  {name: 'Ember', fur: '#E8553D', belly: '#FFE7D6', ear: '#2B1410', eye: '#2A1B3D', head: 0.92, tail: 1.25},
];

/** An original fox character as plain React + SVG, the same shape of code Claude is asked to write. */
export function foxCode(v: Variant): string {
  return `import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

type Props = {expression?: 'happy' | 'surprised' | 'thinking' | 'excited' | 'wink'; pose?: 'idle' | 'pointing' | 'waving' | 'jumping'; talking?: boolean};

const FUR = '${v.fur}';
const BELLY = '${v.belly}';
const DARK = '${v.ear}';
const EYE = '${v.eye}';
const HEAD = ${v.head};
const TAIL = ${v.tail};

const Eyes: React.FC<{expression: string}> = ({expression}) => {
  if (expression === 'happy' || expression === 'excited') {
    return (
      <g stroke={EYE} strokeWidth={9} strokeLinecap="round" fill="none">
        <path d="M150 196 Q170 176 190 196" />
        <path d="M210 196 Q230 176 250 196" />
      </g>
    );
  }
  if (expression === 'wink') {
    return (
      <g>
        <circle cx={170} cy={196} r={14} fill={EYE} />
        <path d="M210 198 Q230 182 250 198" stroke={EYE} strokeWidth={9} strokeLinecap="round" fill="none" />
      </g>
    );
  }
  const r = expression === 'surprised' ? 19 : 15;
  return (
    <g>
      <circle cx={170} cy={196} r={r} fill={EYE} />
      <circle cx={230} cy={196} r={r} fill={EYE} />
      <circle cx={175} cy={190} r={5} fill="#FFFFFF" />
      <circle cx={235} cy={190} r={5} fill="#FFFFFF" />
      {expression === 'thinking' ? <path d="M150 166 L188 172 M212 172 L250 166" stroke={DARK} strokeWidth={7} strokeLinecap="round" /> : null}
    </g>
  );
};

const Mouth: React.FC<{expression: string; open: number}> = ({expression, open}) => {
  if (expression === 'surprised') return <ellipse cx={200} cy={250} rx={13} ry={16 + open * 4} fill={DARK} />;
  if (expression === 'thinking') return <path d="M186 252 Q200 246 214 254" stroke={DARK} strokeWidth={6} strokeLinecap="round" fill="none" />;
  if (expression === 'excited') return <path d="M176 242 Q200 280 224 242 Z" fill={DARK} />;
  return <path d={'M182 244 Q200 ' + (262 + open * 8) + ' 218 244'} stroke={DARK} strokeWidth={6} strokeLinecap="round" fill={open > 0.3 ? DARK : 'none'} />;
};

export const Character: React.FC<Props> = ({expression = 'happy', pose = 'idle', talking = false}) => {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame / 9) * 6;
  const jump = pose === 'jumping' ? -Math.abs(Math.sin(frame / 7)) * 30 : 0;
  const wave = pose === 'waving' ? Math.sin(frame / 5) * 25 : 0;
  const open = talking ? (Math.sin(frame / 2.2) + 1) / 2 : 0;
  const tailSwing = interpolate(Math.sin(frame / 12), [-1, 1], [-8, 8]);
  const rightArm = pose === 'pointing' ? 'rotate(-70 262 330)' : pose === 'waving' ? 'rotate(' + (-140 + wave) + ' 262 330)' : 'rotate(12 262 330)';
  return (
    <svg viewBox="0 0 400 480" width="100%" style={{display: 'block', overflow: 'visible'}}>
      <g transform={'translate(0 ' + (bob + jump) + ')'}>
        <ellipse cx={200} cy={470} rx={110} ry={12} fill="rgba(0,0,0,0.25)" />
        <g transform={'rotate(' + tailSwing + ' 290 400) translate(290 400) scale(' + TAIL + ') translate(-290 -400)'}>
          <path d="M280 410 Q380 380 360 290 Q352 360 300 372 Z" fill={FUR} />
          <path d="M352 300 Q362 330 344 352 Q356 316 340 300 Z" fill={BELLY} />
        </g>
        <path d="M130 300 Q200 270 270 300 L280 430 Q200 460 120 430 Z" fill={FUR} />
        <ellipse cx={200} cy={380} rx={52} ry={62} fill={BELLY} />
        <rect x={146} y={420} width={38} height={44} rx={18} fill={DARK} />
        <rect x={216} y={420} width={38} height={44} rx={18} fill={DARK} />
        <g transform="rotate(-12 138 330)">
          <rect x={112} y={318} width={30} height={84} rx={15} fill={FUR} />
        </g>
        <g transform={rightArm}>
          <rect x={258} y={318} width={30} height={84} rx={15} fill={FUR} />
          <circle cx={273} cy={402} r={16} fill={DARK} />
        </g>
        <g transform={'translate(200 210) scale(' + HEAD + ') translate(-200 -210)'}>
          <path d="M108 170 L120 60 L184 130 Z" fill={FUR} />
          <path d="M292 170 L280 60 L216 130 Z" fill={FUR} />
          <path d="M126 150 L130 86 L170 132 Z" fill={DARK} />
          <path d="M274 150 L270 86 L230 132 Z" fill={DARK} />
          <path d="M100 190 Q100 112 200 112 Q300 112 300 190 Q300 262 200 286 Q100 262 100 190 Z" fill={FUR} />
          <path d="M132 222 Q200 300 268 222 Q246 278 200 286 Q154 278 132 222 Z" fill={BELLY} />
          <Eyes expression={expression} />
          <ellipse cx={200} cy={228} rx={14} ry={10} fill={DARK} />
          <Mouth expression={expression} open={open} />
          {expression === 'happy' || expression === 'excited' ? (
            <g fill="#FF6F91" opacity={0.55}>
              <ellipse cx={140} cy={236} rx={16} ry={9} />
              <ellipse cx={260} cy={236} rx={16} ry={9} />
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
};
`;
}

export function characterAnswer() {
  return JSON.stringify({characters: FOX_VARIANTS.map((v) => ({name: v.name, code: foxCode(v)})), voices: ['af_bella', 'af_heart', 'bf_emma']});
}

const TOPICS = [
  'A day on Venus is longer than its year',
  'Venus spins the other way',
  'The hottest planet is not the closest',
  'Sunrise in the west on Venus',
  'Clouds that melt lead',
  'Why Venus glows so bright',
  'The slowest spinning planet',
  'A birthday before tomorrow',
];

const CTA_LINES = {
  follow: (who: string | null) => `Follow ${who ?? 'us'} for a new mind-blowing fact every day!`,
  comment: () => 'Comment your best guess below and see if you were right!',
  link: () => 'Tap the link in bio to learn even more!',
};

export type PlanRequest = {seconds?: number; cta?: 'follow' | 'comment' | 'link'; minWords?: number; maxWords?: number; usedTopics?: string[]; characterName?: string | null};

/**
 * A valid plan for the requested length, built from Pip Explains' Venus fixture:
 * keeps the hook, recap and CTA and as many fact scenes as fit the word range.
 */
export function planAnswer(characterName: string | null, req: PlanRequest = {}) {
  const venus = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'venus.json'), 'utf8'));
  const cta = req.cta ?? 'follow';
  const all = venus.scenes as any[];
  const hook = all[0];
  const recap = all.at(-2);
  const end = {...all.at(-1), narration: CTA_LINES[cta](characterName)};
  const facts = all.slice(1, -2);
  const max = req.maxWords ?? 168;
  const min = req.minWords ?? 145;
  const words = (xs: any[]) => xs.reduce((n, x) => n + countWords(x.narration), 0);
  let chosen = [...facts];
  // Drop fact scenes from the end until the script fits (keep at least 3, alternate layouts).
  while (chosen.length > 3 && words([hook, ...chosen, recap, end]) > max) chosen = chosen.slice(0, -1);
  // Still too long: keep only the first sentence of each fact (shortest first), stop once it fits.
  chosen = chosen.map((x) => ({...x}));
  const order = chosen.map((_, i) => i).sort((a, b) => countWords(chosen[b].narration) - countWords(chosen[a].narration));
  for (const i of order) {
    if (words([hook, ...chosen, recap, end]) <= max) break;
    const first = chosen[i].narration.split(/(?<=[.!?])\s+/)[0];
    chosen[i].narration = first;
  }
  const scenes = [hook, ...chosen, recap, end];
  if (words(scenes) < min) {
    // pad the last fact scene a little so short videos still fit
    const last = chosen.at(-1);
    last.narration = `${last.narration} That is truly amazing.`;
  }
  const used = (req.usedTopics ?? []).map((t) => t.toLowerCase());
  const topic = TOPICS.find((t) => !used.includes(t.toLowerCase())) ?? `Venus fact ${used.length + 1}`;
  return JSON.stringify({niche: 'Science', hookType: 'shock', captionStyle: 'question', ...venus, topic, scenes});
}

/** Reads what the planner asked for from its prompts. */
export function parsePlanRequest(prompt: string, system: string): PlanRequest {
  const len = /exactly (\d+) seconds of video; narration (\d+) to (\d+) words/.exec(system);
  const cta = /ask viewers to follow/.test(system) ? 'follow' : /ask viewers to comment/.test(system) ? 'comment' : /link in bio/.test(system) ? 'link' : 'follow';
  const usedBlock = /Topics already used[^\n]*\n([\s\S]*?)(\n\n|$)/.exec(prompt)?.[1] ?? '';
  const usedTopics = usedBlock.split('\n').map((l) => l.replace(/^- /, '').trim()).filter((l) => l && l !== '(none yet)');
  return len ? {seconds: Number(len[1]), minWords: Number(len[2]), maxWords: Number(len[3]), cta, usedTopics} : {cta, usedTopics};
}

export const planWords = () => JSON.parse(planAnswer('Nova')).scenes.reduce((n: number, s: any) => n + countWords(s.narration), 0);

export const weeklyAnswer = () =>
  JSON.stringify({
    summary: 'Space facts with a shocking first line did best this week. With only a few videos this is an early guess, not a rule.',
    changes: ['More space topics', 'Start with a surprising number', 'Keep posting at 20:00'],
  });

export const refAnalysisAnswer = () =>
  JSON.stringify({
    summary: 'A fast product promo that opens with a question typed into a search bar.',
    hook: 'A typed question with a cursor click in the first second.',
    structure: ['question hook', 'show the problem', 'product as the answer', 'two quick benefits', 'call to action'],
    pace: 'fast',
    onScreenText: 'Large bold words that blur in one by one',
    tone: 'confident and friendly',
    techniques: ['typing text', 'pointer clicks', 'zoom cuts'],
    cta: 'Tells viewers to tap the link in bio',
  });

/** A director plan (step 1 of a director video): the layout plan plus a format, a brief and an idea per beat. */
export function directorAnswer(characterName: string | null, req: PlanRequest = {}) {
  const plan = JSON.parse(planAnswer(characterName, req));
  return JSON.stringify({
    ...plan,
    format: 'tiny story with a twist',
    brief: 'Open close on a slowly turning planet that fills the frame, then pull the camera back in one smooth dolly with spring easing. Each fact lands as a big bold card that slides up with a staggered spring, the key word marked in the accent colour. The character stands at the side and points at each new card. Keep everything flat and matte, theme colours only, and let the pace build towards a quick recap before a friendly wave at the end.',
    scenes: plan.scenes.map((s: any, i: number) => ({...s, idea: `Beat ${i + 1}: a bold card with the headline slides up while the character reacts.`, icon: s.visual?.icon ?? 'planet'})),
  });
}

/** The episode code the fake animator returns (step 2 of a director video). */
export const episodeAnswer = () => '```tsx\n' + fs.readFileSync(path.join(ROOT, 'fixtures', 'director', 'basic-episode.tsx'), 'utf8') + '```';

/** Fake Claude: picks the fixture from what the prompt asks for. */
export function fakeAsk(characterName: () => string | null = () => 'Nova'): Ask {
  return async (prompt, system) => {
    if (/Reply with the word OK/i.test(prompt)) return 'OK';
    if (/You are a senior motion designer/.test(system)) return episodeAnswer();
    if (/YOU ARE THE CREATIVE DIRECTOR/.test(system)) return directorAnswer(characterName(), parsePlanRequest(prompt, system));
    if (/Weekly TikTok analysis/i.test(prompt)) return weeklyAnswer();
    if (/You study short marketing videos/.test(system)) return refAnalysisAnswer();
    if (/You design ORIGINAL cartoon characters/.test(system)) return /breaks these rules/.test(prompt) ? JSON.stringify({name: 'Nova', code: foxCode(FOX_VARIANTS[0])}) : characterAnswer();
    return planAnswer(characterName(), parsePlanRequest(prompt, system));
  };
}
