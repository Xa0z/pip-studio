import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {ROOT} from '../src/config';
import {directorAnswer, episodeAnswer, planAnswer} from '../studio/dev/fixtures';
import {fakeRenderer, Harness, runOnboarding} from '../studio/dev/harness';
import {checkEpisodeCode} from '../studio/lib/charcheck';
import {directorPlanSchema} from '../studio/lib/director-schema';
import {coderPrompt, coderSystem, extractCode, fallbackScenes, skillRules, typecheckEpisode} from '../studio/worker/director';
import {systemPrompt, type PlanContext} from '../studio/worker/planner';

const OWNER = 5550001;
const basic = fs.readFileSync(path.join(ROOT, 'fixtures', 'director', 'basic-episode.tsx'), 'utf8');

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  niche: 'science', goal: 'followers', seconds: 45, cta: 'follow', characterName: 'Pip', linkUrl: null, pastTopics: [], hints: [], experiment: false, recentHookTypes: [], ...over,
});

describe('director videos: step 1, the creative plan', () => {
  it('replaces the fixed scene structure and layouts with free beats and a brief', () => {
    const s = systemPrompt(ctx({director: {recentFormats: ['countdown', 'myth vs fact']}}));
    expect(s).toContain('YOU ARE THE CREATIVE DIRECTOR');
    expect(s).toContain('do something clearly different): countdown; myth vs fact');
    expect(s).toContain('ACCURACY RULES'); // the topic rules stay
    expect(s).toContain('CAPTION AND HASHTAGS');
    expect(s).not.toContain('Every fact scene has a "visual"');
    expect(s).not.toContain('Second to last scene, role "recap"');
    expect(s).toMatch(/OUTPUT:[\s\S]*brief/);
    // The layout plan is unchanged when director mode is off.
    expect(systemPrompt(ctx())).toContain('Every fact scene has a "visual"');
  });

  it('works for marketing videos too', () => {
    const marketing = {business: 'A small bakery in Leeds.', notes: '', index: 0, analysis: {summary: 's', hook: 'h', structure: ['a'], pace: 'fast' as const, onScreenText: 't', tone: 't', techniques: [], cta: 'c'}};
    const s = systemPrompt(ctx({marketing, director: {recentFormats: []}}));
    expect(s).toContain('A small bakery in Leeds.');
    expect(s).toContain('HONESTY RULES');
    expect(s).toContain('YOU ARE THE CREATIVE DIRECTOR');
    expect(s).not.toContain('Every fact scene has a "visual"');
  });

  it('accepts a plan with any middle structure, and needs a brief', () => {
    const schema = directorPlanSchema({seconds: 62, cta: 'follow'});
    const plan = JSON.parse(directorAnswer('Pip'));
    expect(schema.safeParse(plan).success).toBe(true);
    // No recap and no visuals: fine for a director plan, not for a layout plan.
    const free = {...plan, scenes: plan.scenes.filter((s: any) => s.role !== 'recap').map(({visual, ...s}: any) => s)};
    for (const b of free.scenes.slice(1, 4)) b.narration += ' Truly strange.';
    expect(schema.safeParse(free).error?.issues ?? []).toEqual([]);
    expect(schema.safeParse({...plan, brief: undefined}).success).toBe(false);
    expect(schema.safeParse({...plan, scenes: plan.scenes.map((s: any) => ({...s, idea: undefined}))}).success).toBe(false);
  });
});

describe('director videos: step 2, the code', () => {
  it('tells the animator the Remotion skill rules, the kit and the timed beats', () => {
    const rules = skillRules();
    expect(rules).toContain('useFrame()'); // from the skill's 3d.md
    expect(rules).toContain('Easing.bezier');
    const sys = coderSystem();
    expect(sys).toContain('export const Episode');
    expect(sys).toContain('export const Character'); // kit source
    const plan = JSON.parse(directorAnswer('Pip'));
    const scenes = plan.scenes.map((s: any, i: number) => ({...s, from: i * 60, durationInFrames: 60}));
    const p = coderPrompt({plan, scenes, words: [{text: 'Venus', start: 0.2, end: 0.6}], theme: {bg: '#000000'} as any, characterName: 'Pip', totalFrames: scenes.length * 60});
    expect(p).toContain(plan.brief);
    expect(p).toContain('Beat 0 (hook) frames 0 to 59');
    expect(p).toContain('Venus@0.2');
  });

  it('reads the code from a reply', () => {
    expect(extractCode('Here you go:\n```tsx\nexport const Episode = () => null;\n```\nDone')).toBe('export const Episode = () => null;\n');
    expect(extractCode(episodeAnswer())).toBe(basic.trim() + '\n');
  });

  it('accepts normal 2D and 3D episode code', async () => {
    expect(checkEpisodeCode(basic)).toEqual([]);
    const three = `import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {DoubleSide} from 'three';
import {Character, useTheme} from '../kit';
export const Episode: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const th = useTheme();
  const z = interpolate(frame, [0, 60], [9, 5], {extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)});
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{position: [0, 0, z], fov: 40}}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <mesh rotation={[0, frame * 0.02, 0]}>
          <sphereGeometry args={[1.4, 64, 64]} />
          <meshStandardMaterial color={th.accent} roughness={0.8} side={DoubleSide} />
        </mesh>
      </ThreeCanvas>
      <div style={{position: 'absolute', left: 60, top: 900}}><Character expression="happy" pose="pointing" width={320} /></div>
    </AbsoluteFill>
  );
};
`;
    expect(checkEpisodeCode(three)).toEqual([]);
    expect(await typecheckEpisode(three, 'e_test3d')).toEqual([]);
  });

  it('rejects unsafe or non-deterministic code', () => {
    const bad = (body: string) => checkEpisodeCode(`import React from 'react';\nexport const Episode = () => ${body};\n`);
    expect(bad(`<img src="x.png" />`).join()).toMatch(/<img> is not allowed/);
    expect(bad(`<div style={{transition: 'all 1s'}} />`).join()).toMatch(/transition/);
    expect(bad(`<primitive object={1} />`).join()).toMatch(/<primitive> is not allowed/);
    expect(bad(`<div>{fetch('https://x.y')}</div>`).join()).toMatch(/fetch/);
    expect(bad(`<div>{String(new Date())}</div>`).join()).toMatch(/"new" is not allowed/);
    expect(checkEpisodeCode(`import {useFrame} from '@react-three/fiber';\nexport const Episode = () => null;`).join()).toMatch(/not allowed/);
    expect(checkEpisodeCode(`export const Video = () => null;`).join()).toMatch(/must export a component named "Episode"/);
  });

  it('finds type errors without running the code', async () => {
    const errors = await typecheckEpisode(basic.replace('size={180}', 'size="big"'), 'e_testbad');
    expect(errors.join()).toMatch(/TS2322/);
  });

  it('gives every beat a drawing for the layout fallback', () => {
    const plan = JSON.parse(directorAnswer('Pip'));
    const scenes = plan.scenes.map(({visual, ...s}: any, i: number) => ({...s, from: i, durationInFrames: 1}));
    scenes[scenes.length - 2] = {...scenes[scenes.length - 2], bullets: undefined};
    const out = fallbackScenes(scenes);
    for (const s of out.filter((x) => x.role === 'fact')) expect(s.visual?.layout).toBe('spotlight');
    expect(out.some((s) => s.role === 'recap')).toBe(false);
  });
});

describe('director videos in the pipeline', () => {
  let h: Harness;
  afterEach(() => h?.close());

  const capture = () => {
    const calls: any[] = [];
    const renderer = {
      ...fakeRenderer,
      video: (async (o: {outPath: string; props: any}) => {
        calls.push(o.props);
        fs.writeFileSync(o.outPath, Buffer.from('fake mp4'));
      }) as any,
    };
    return {calls, renderer};
  };

  it('plans with a brief, writes the video as code, and renders that code', async () => {
    const {calls, renderer} = capture();
    h = new Harness({userId: OWNER, ownerId: OWNER, renderer});
    await runOnboarding(h);
    const v = [...h.store.videos.values()].find((x) => x.plan?.scenes)!;
    expect(v.plan.format).toBe('tiny story with a twist');
    expect(v.plan.brief.length).toBeGreaterThan(300);
    expect(v.plan.episode).toBe('code');
    expect(calls).toHaveLength(1);
    expect(calls[0].episodeKey).toMatch(/^e_/);
    expect(h.systems.some((s) => s.includes('You are a senior motion designer'))).toBe(true);
  });

  it('asks Claude to fix code that fails the checks, then falls back to the layouts', async () => {
    const {calls, renderer} = capture();
    let coderCalls = 0;
    h = new Harness({
      userId: OWNER,
      ownerId: OWNER,
      renderer,
      answer: (_p, system) => (/senior motion designer/.test(system) ? (coderCalls++, '```tsx\nexport const Episode = () => <img src="x" />;\n```') : undefined),
    });
    await runOnboarding(h);
    const v = [...h.store.videos.values()].find((x) => x.plan?.scenes)!;
    expect(coderCalls).toBe(3); // first try + 2 fix rounds
    expect(v.plan.episode).toBe('layouts');
    expect(calls[0].episodeKey).toBeNull();
    for (const s of calls[0].scenes.filter((x: any) => x.role === 'fact')) expect(s.visual).toBeTruthy();
    expect(h.chat.some((m) => /test, it was <b>not<\/b> posted/.test(m.text ?? ''))).toBe(true);
  });

  it('makes the same video with the layouts when the code breaks while rendering', async () => {
    const calls: any[] = [];
    const renderer = {
      ...fakeRenderer,
      video: (async (o: {outPath: string; props: any}) => {
        calls.push(o.props);
        if (o.props.episodeKey) throw new Error('TypeError: cannot read x of undefined');
        fs.writeFileSync(o.outPath, Buffer.from('fake mp4'));
      }) as any,
    };
    h = new Harness({userId: OWNER, ownerId: OWNER, renderer});
    await runOnboarding(h);
    expect(calls.map((p) => !!p.episodeKey)).toEqual([true, false]);
    const v = [...h.store.videos.values()].find((x) => x.plan?.scenes)!;
    expect(v.plan.episode).toBe('layouts');
    expect(v.plan.episode_error).toMatch(/render failed: TypeError/);
  });

  it('DIRECTOR_VIDEOS=off keeps the fixed layouts', async () => {
    process.env.DIRECTOR_VIDEOS = 'off';
    try {
      const {calls, renderer} = capture();
      h = new Harness({userId: OWNER, ownerId: OWNER, renderer});
      await runOnboarding(h);
      const v = [...h.store.videos.values()].find((x) => x.plan?.scenes)!;
      expect(v.plan.brief).toBeUndefined();
      expect(calls[0].episodeKey).toBeNull();
      expect(JSON.parse(planAnswer('Pip')).scenes.length).toBeGreaterThan(0);
    } finally {
      delete process.env.DIRECTOR_VIDEOS;
    }
  });
});
