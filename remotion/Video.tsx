import React from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimedScene, VideoProps} from '../src/schema';
import {CHARACTERS} from './character/registry';
import {Background} from './components/Background';
import {isTalking, Subtitles} from './components/Subtitles';
import {CtaScene} from './scenes/CtaScene';
import {FactScene} from './scenes/FactScene';
import {HookScene} from './scenes/HookScene';
import {RecapScene} from './scenes/RecapScene';
import {COLORS, FONT, TOTAL_FRAMES} from './theme';

type Box = {left: number; top: number; width: number};
const PIP_BIG: Box = {left: 300, top: 720, width: 480};
const PIP_CTA: Box = {left: 300, top: 700, width: 480};
const PIP_CORNER: Box = {left: 840, top: 180, width: 200};

const boxFor = (s: TimedScene): Box => (s.role === 'hook' ? PIP_BIG : s.role === 'cta' ? PIP_CTA : PIP_CORNER);

const SceneBody: React.FC<{scene: TimedScene; title: string; ctaLabel: string}> = ({scene, title, ctaLabel}) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [scene.durationInFrames - 6, scene.durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const isLast = scene.role === 'cta';
  return (
    <AbsoluteFill style={{opacity: isLast ? 1 : out}}>
      {scene.role === 'hook' ? <HookScene scene={scene} title={title} /> : null}
      {scene.role === 'fact' ? <FactScene scene={scene} /> : null}
      {scene.role === 'recap' ? <RecapScene scene={scene} /> : null}
      {scene.role === 'cta' ? <CtaScene scene={scene} label={ctaLabel} /> : null}
    </AbsoluteFill>
  );
};

export const Video: React.FC<VideoProps> = ({title, scenes, words, voiceFile, musicFile, totalFrames = TOTAL_FRAMES, character = 'pip', ctaLabel = '+ Follow Pip'}) => {
  const Character = character ? CHARACTERS[character] ?? null : null;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const idx = Math.max(0, scenes.findIndex((s) => frame >= s.from && frame < s.from + s.durationInFrames));
  const scene = scenes[idx];
  const prev = scenes[idx - 1];
  const target = boxFor(scene);
  const from = prev ? boxFor(prev) : target;
  const move = spring({frame: frame - scene.from, fps, config: {damping: 16, mass: 0.7}});
  const lerp = (a: number, b: number) => a + (b - a) * move;
  const pipBox = {left: lerp(from.left, target.left), top: lerp(from.top, target.top), width: lerp(from.width, target.width)};

  const showBadge = scene.role === 'fact' || scene.role === 'recap';

  return (
    <AbsoluteFill style={{backgroundColor: COLORS.bg}}>
      <Background />

      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames} layout="none">
          <SceneBody scene={s} title={title} ctaLabel={ctaLabel} />
        </Sequence>
      ))}

      {showBadge ? (
        <div style={{position: 'absolute', top: 236, left: 70, fontFamily: FONT, fontWeight: 700, fontSize: 36, color: COLORS.onSage, background: COLORS.sage, borderRadius: 10, padding: '6px 24px'}}>{title}</div>
      ) : null}

      {Character ? (
        <div style={{position: 'absolute', left: pipBox.left, top: pipBox.top, width: pipBox.width}}>
          <Character expression={scene.pip.expression} pose={scene.pip.pose} talking={isTalking(words, t)} />
        </div>
      ) : null}

      <Subtitles words={words} />

      {voiceFile ? <Audio src={staticFile(voiceFile)} /> : null}
      {musicFile ? (
        <Audio
          src={staticFile(musicFile)}
          loop
          volume={(f) => 0.1 * interpolate(f, [0, 15, totalFrames - 45, totalFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
      ) : null}
    </AbsoluteFill>
  );
};
