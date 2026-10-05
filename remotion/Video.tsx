import React, {useContext} from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimedScene, VideoProps} from '../src/schema';
import {CHARACTERS} from './character/registry';
import {Background} from './components/Background';
import {isTalking, Subtitles} from './components/Subtitles';
import {CTA_TAP, CtaScene} from './scenes/CtaScene';
import {FactScene} from './scenes/FactScene';
import {hookClick, HookScene, TYPE_START} from './scenes/HookScene';
import {typedEnd} from './scenes/common';
import {RecapScene} from './scenes/RecapScene';
import {resolveTheme} from '../src/themes';
import {FONT, ThemeContext, TOTAL_FRAMES} from './theme';
import {EASE_IN, EASE_IN_OUT, ENTER_FRAMES, EXIT_FRAMES, prog, transitionFor, WIPE_FRAMES} from './motion';

type Box = {left: number; top: number; width: number};
const PIP_BIG: Box = {left: 320, top: 770, width: 440};
const PIP_CTA: Box = {left: 300, top: 700, width: 480};
const PIP_CORNER: Box = {left: 840, top: 180, width: 200};

const boxFor = (s: TimedScene): Box => (s.role === 'hook' ? PIP_BIG : s.role === 'cta' ? PIP_CTA : PIP_CORNER);

const SceneBody: React.FC<{scene: TimedScene; index: number; last: boolean; title: string; ctaLabel: string}> = ({scene, index, last, title, ctaLabel}) => {
  const frame = useCurrentFrame();
  const d = scene.durationInFrames;
  const enter = index === 0 ? 'zoom' : transitionFor(index);
  const exit = last ? null : transitionFor(index + 1);
  const i = prog(frame, 0, ENTER_FRAMES);
  const o = interpolate(frame, [d - EXIT_FRAMES, d], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN});
  // A slow camera push across the whole scene keeps still frames alive.
  let scale = interpolate(frame, [0, d], [1, 1.035]);
  let x = 0;
  let opacity = 1;
  if (enter === 'push') x += (1 - i) * 260;
  if (enter === 'zoom') scale *= interpolate(i, [0, 1], [0.9, 1]);
  if (enter !== 'wipe') opacity *= Math.min(1, i * 1.6);
  if (exit === 'push') x -= o * 260;
  if (exit === 'zoom') scale *= 1 + o * 0.12;
  if (exit && exit !== 'wipe') opacity *= 1 - o;
  let blur = 0;
  if (enter !== 'wipe' && index > 0) blur += (1 - i) * 18;
  if (exit && exit !== 'wipe') blur += o * 22;
  return (
    <AbsoluteFill style={{opacity, scale: `${scale}`, translate: `${x}px 0`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined}}>
      {scene.role === 'hook' ? <HookScene scene={scene} title={title} /> : null}
      {scene.role === 'fact' ? <FactScene scene={scene} /> : null}
      {scene.role === 'recap' ? <RecapScene scene={scene} /> : null}
      {scene.role === 'cta' ? <CtaScene scene={scene} label={ctaLabel} /> : null}
    </AbsoluteFill>
  );
};

/** Two flat panels that sweep across the cut, the second chasing the first. Covers the swap of scenes. */
const Wipe: React.FC<{at: number; dir: 1 | -1}> = ({at, dir}) => {
  const th = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const half = WIPE_FRAMES / 2;
  const panel = (lag: number, color: string) => {
    const f = frame - lag;
    const x = interpolate(f, [at - half, at, at + half], [-1, 0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT});
    if (f < at - half || f > at + half) return null;
    return <div style={{position: 'absolute', top: -200, bottom: -200, left: -300, right: -300, background: color, rotate: '-8deg', translate: `${dir * x * 1700}px 0`}} />;
  };
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      {panel(0, th.accentSoft)}
      {panel(2, th.accent)}
    </AbsoluteFill>
  );
};

/** One thin segment per scene along the top edge, filling as the video plays. */
const Progress: React.FC<{scenes: TimedScene[]}> = ({scenes}) => {
  const th = useContext(ThemeContext);
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'absolute', top: 64, left: 80, right: 80, display: 'flex', gap: 10}}>
      {scenes.map((s, k) => {
        const fill = interpolate(frame, [s.from, s.from + s.durationInFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <div key={k} style={{flex: s.durationInFrames, height: 8, borderRadius: 4, background: th.track, overflow: 'hidden'}}>
            <div style={{width: `${fill * 100}%`, height: '100%', background: th.accent, borderRadius: 4}} />
          </div>
        );
      })}
    </div>
  );
};

export const Video: React.FC<VideoProps> = ({title, scenes, words, voiceFile, musicFile, totalFrames = TOTAL_FRAMES, character = 'pip', ctaLabel = '+ Follow Pip', theme, sfx = false}) => {
  const th = theme ?? resolveTheme(null);
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

  const cta = scenes.find((s) => s.role === 'cta');
  const hook = scenes.find((s) => s.role === 'hook');
  const showBadge = scene.role === 'fact' || scene.role === 'recap';

  return (
    <ThemeContext.Provider value={th}>
    <AbsoluteFill style={{backgroundColor: th.bg}}>
      <Background sceneIndex={idx} sceneFrom={scene.from} />

      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames} layout="none">
          <SceneBody scene={s} index={i} last={i === scenes.length - 1} title={title} ctaLabel={ctaLabel} />
        </Sequence>
      ))}

      {scenes.map((s, i) => (i > 0 && transitionFor(i) === 'wipe' ? <Wipe key={`w${i}`} at={s.from} dir={i % 2 ? 1 : -1} /> : null))}

      <Progress scenes={scenes} />

      {showBadge ? (
        <div style={{position: 'absolute', top: 236, left: 70, fontFamily: FONT, fontWeight: 700, fontSize: 36, color: th.onAccent, background: th.accent, borderRadius: 10, padding: '6px 24px'}}>{title}</div>
      ) : null}

      {Character ? (
        <div style={{position: 'absolute', left: pipBox.left, top: pipBox.top, width: pipBox.width}}>
          <Character expression={scene.pip.expression} pose={scene.pip.pose} talking={isTalking(words, t)} />
        </div>
      ) : null}

      <Subtitles words={words} />

      {sfx
        ? scenes.map((s, i) =>
            i > 0 ? (
              <Sequence key={`sfx${i}`} from={Math.max(0, s.from - 6)} durationInFrames={20} layout="none">
                <Audio src={staticFile('sfx/whoosh.wav')} volume={0.22} />
              </Sequence>
            ) : null,
          )
        : null}
      {sfx && hook ? (
        <>
          <Sequence from={hook.from + TYPE_START} durationInFrames={typedEnd(hook.headline, TYPE_START) - TYPE_START} layout="none">
            <Audio src={staticFile('sfx/typing.wav')} volume={0.3} />
          </Sequence>
          <Sequence from={hook.from + hookClick(hook.headline)} durationInFrames={10} layout="none">
            <Audio src={staticFile('sfx/click.wav')} volume={0.45} />
          </Sequence>
        </>
      ) : null}
      {sfx && cta ? (
        <Sequence from={cta.from + CTA_TAP} durationInFrames={10} layout="none">
          <Audio src={staticFile('sfx/click.wav')} volume={0.45} />
          <Audio src={staticFile('sfx/pop.wav')} volume={0.3} />
        </Sequence>
      ) : null}

      {voiceFile ? <Audio src={staticFile(voiceFile)} /> : null}
      {musicFile ? (
        <Audio
          src={staticFile(musicFile)}
          loop
          volume={(f) => 0.1 * interpolate(f, [0, 15, totalFrames - 45, totalFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
      ) : null}
    </AbsoluteFill>
    </ThemeContext.Provider>
  );
};
