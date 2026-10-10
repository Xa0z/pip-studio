/**
 * Makes one director video from files, the same way the worker does after Claude answered:
 * voice -> timed beats -> code checks -> render. Used for test videos (on Actions for the real voice).
 *
 *   npx tsx studio/dev/director-test.ts prompts <plan.json> <outDir>      writes the exact prompts the bot sends
 *   npx tsx studio/dev/director-test.ts render <plan.json> <episode.tsx> <out.mp4>
 *
 * Options (env): SECONDS (default 45), THEME (preset id, default sage), TTS_PROVIDER=fake for a silent local try.
 */
import fs from 'node:fs';
import path from 'node:path';
import {checkDuration, renderVideo} from '../../src/render.js';
import type {TimedScene, Word} from '../../src/schema.js';
import {pickStyle} from '../../src/styles.js';
import {resolveTheme, type PresetId} from '../../src/themes.js';
import {buildTimeline, lengthSpec, validateTimeline, voiceProblems} from '../../src/timeline.js';
import {synthesize, type VoiceResult} from '../../src/voice.js';
import {checkEpisodeCode} from '../lib/charcheck.js';
import {directorPlanSchema} from '../lib/director-schema.js';
import type {StudioPlan} from '../lib/plan-schema.js';
import {writeRegistry} from '../worker/characters.js';
import {coderPrompt, coderSystem, episodeKey, fallbackScenes, typecheckEpisode, writeEpisodeRegistry} from '../worker/director.js';
import {systemPrompt, userPrompt} from '../worker/planner.js';

const [mode, planFile, ...rest] = process.argv.slice(2);
const seconds = Number(process.env.SECONDS ?? 45);
const theme = resolveTheme({preset: (process.env.THEME ?? 'sage') as PresetId});
const pctx = {niche: 'science', goal: 'followers' as const, seconds, cta: 'follow' as const, characterName: 'Pip', linkUrl: null, pastTopics: [], hints: [], experiment: false, recentHookTypes: [], director: {recentFormats: []}};

async function timed(plan: StudioPlan, dir: string) {
  const spec = lengthSpec(seconds);
  let speed = 1;
  let voice: VoiceResult | null = null;
  for (let round = 0; round < 6 && !voice; round++) {
    const v = await synthesize(plan, dir, speed, 'af_heart', (spec.speechMin + spec.speechMax) / 2);
    const problems = voiceProblems(plan, v, spec);
    if (!problems.length) voice = v;
    else if (problems.every((p) => p.startsWith('spoken length'))) speed = Math.min(1.1, Math.max(0.9, (speed * v.speechEnd) / ((spec.speechMin + spec.speechMax) / 2)));
    else throw new Error(`The script needs a rewrite: ${problems.join('; ')}`);
  }
  if (!voice) throw new Error('voice did not fit');
  const scenes = buildTimeline(plan, voice, spec);
  validateTimeline(scenes, spec, 6);
  return {voice, scenes, spec};
}

async function main() {
  const plan = directorPlanSchema({seconds, cta: 'follow'}).parse(JSON.parse(fs.readFileSync(planFile, 'utf8'))) as unknown as StudioPlan;
  if (mode === 'prompts') {
    const out = rest[0];
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(path.join(out, '1-director-system.txt'), systemPrompt(pctx));
    fs.writeFileSync(path.join(out, '1-director-user.txt'), userPrompt(pctx));
    const {voice, scenes, spec} = await timed(plan, out);
    fs.writeFileSync(path.join(out, '2-coder-system.txt'), coderSystem());
    fs.writeFileSync(path.join(out, '2-coder-user.txt'), coderPrompt({plan, scenes, words: voice.words as Word[], theme, characterName: 'Pip', totalFrames: spec.totalFrames}));
    console.log(`Prompts written to ${out}`);
    return;
  }
  const [codeFile, outPath] = rest;
  const code = fs.readFileSync(codeFile, 'utf8');
  const problems = [...checkEpisodeCode(code), ...(await typecheckEpisode(code))];
  if (problems.length) throw new Error(`Episode code rejected:\n- ${problems.join('\n- ')}`);
  const dir = path.join(path.dirname(path.resolve(outPath)), 'work');
  fs.mkdirSync(dir, {recursive: true});
  const {voice, scenes, spec} = await timed(plan, dir);
  const key = episodeKey('directortest');
  writeEpisodeRegistry([{key, code}]);
  writeRegistry([]);
  try {
    await renderVideo({
      props: {episode: 1, title: 'Test', scenes: fallbackScenes(scenes as TimedScene[]), words: voice.words as Word[], totalFrames: spec.totalFrames, character: 'pip', ctaLabel: '+ Follow Pip', theme, style: pickStyle(7), episodeKey: key},
      voicePath: voice.wavPath,
      musicPath: null,
      outPath,
    });
    await checkDuration(outPath, spec.totalFrames);
  } finally {
    writeEpisodeRegistry([]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
