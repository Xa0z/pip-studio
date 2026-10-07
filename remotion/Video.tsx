import React, {useContext} from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimedScene, VideoProps} from '../src/schema';
import {CHARACTERS} from './character/registry';
import {Background} from './components/Background';
import {isTalking, Subtitles} from './components/Subtitles';
import {CTA_TAP, CtaScene} from './scenes/CtaScene';
import {FactScene} from './scenes/FactScene';
import {CardHook, PosterHook} from './scenes/HookVariants';
import {hookClick, HookScene, hookSpeed, TYPE_START} from './scenes/HookScene';
import {typedEnd} from './scenes/common';
import {RecapScene} from './scenes/RecapScene';
import {resolveTheme} from '../src/themes';
import {FONT, StyleContext, ThemeContext, TOTAL_FRAMES, useStyle} from './theme';
import {resolveStyle} from '../src/styles';
import {EASE_IN, EASE_IN_OUT, ENTER_FRAMES, EXIT_FRAMES, prog, transitionFor, WIPE_FRAMES} from './motion';

type Box = {left: number; top: number; width: number};
const PIP_BIG: Box = {left: 320, top: 770, width: 440};
const PIP_CTA: Box = {left: 300, top: 700, width: 480};
const PIP_CORNER: Box = {left: 840, top: 180, width: 200};
const PIP_CORNER_LEFT: Box = {left: 40, top: 180, width: 200};

const boxFor = (s: TimedScene, side: 'left' | 'right' = 'right'): Box => (s.role === 'hook' ? PIP_BIG : s.role === 'cta' ? PIP_CTA : side === 'left' ? PIP_CORNER_LEFT : PIP_CORNER);

const SceneBody: React.FC<{scene: TimedScene; index: number; factIndex: number; last: boolean; title: string; ctaLabel: string}> = ({scene, index, factIndex, last, title, ctaLabel}) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const d = scene.durationInFrames;
  const enter = index === 0 ? 'zoom' : transitionFor(index, style.cuts);
  const exit = last ? null : transitionFor(index + 1, style.cuts);
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
  let y = 0;
  let rotY = 0;
  let clip: string | undefined;
  if (enter === 'lift') y += (1 - i) * 320;
  if (exit === 'lift') y -= o * 320;
  if (enter === 'flip') rotY += (1 - i) * -90;
  if (exit === 'flip') rotY += o * 90;
  // Iris: the new scene opens from a circle in the middle; the old one closes into one.
  if (enter === 'iris' && i < 1) clip = `circle(${i * 120}% at 50% 45%)`;
  if (exit === 'iris' && o > 0) clip = `circle(${(1 - o) * 120}% at 50% 45%)`;
  let blur = 0;
  // Only the classic cuts blur; the other families stay crisp.
  if (style.cuts === 'classic') {
    if (enter !== 'wipe' && index > 0) blur += (1 - i) * 18;
    if (exit && exit !== 'wipe') blur += o * 22;
  }
  const flat = rotY === 0;
  return (
    <AbsoluteFill
      style={{
        opacity,
        scale: `${scale}`,
        translate: `${x}px ${y}px`,
        transform: flat ? undefined : `perspective(1800px) rotateY(${rotY}deg)`,
        clipPath: clip,
        filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
      }}
    >
      {scene.role === 'hook' ? style.hook === 'card' ? <CardHook scene={scene} title={title} /> : style.hook === 'poster' ? <PosterHook scene={scene} title={title} /> : <HookScene scene={scene} title={title} /> : null}
      {scene.role === 'fact' ? <FactScene scene={scene} factIndex={factIndex} /> : null}
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
const Progress: React.FC<{scenes: TimedScene[]; kind: 'segments' | 'line' | 'none'; total: number}> = ({scenes, kind, total}) => {
  const th = useContext(ThemeContext);
  const frame = useCurrentFrame();
  if (kind === 'none') return null;
  if (kind === 'line') {
    const fill = interpolate(frame, [0, total], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    return (
      <div style={{position: 'absolute', top: 0, left: 0, width: 1080, height: 12, background: th.track}}>
        <div style={{width: `${fill * 100}%`, height: '100%', background: th.accent}} />
      </div>
    );
  }
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

export const Video: React.FC<VideoProps> = ({title, scenes, words, voiceFile, musicFile, totalFrames = TOTAL_FRAMES, character = 'pip', ctaLabel = '+ Follow Pip', theme, style: styleIn, sfx = false}) => {
  const th = theme ?? resolveTheme(null);
  const style = resolveStyle(styleIn);
  const Character = character ? CHARACTERS[character] ?? null : null;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const idx = Math.max(0, scenes.findIndex((s) => frame >= s.from && frame < s.from + s.durationInFrames));
  const scene = scenes[idx];
  const prev = scenes[idx - 1];
  const target = boxFor(scene, style.side);
  const from = prev ? boxFor(prev, style.side) : target;
  const move = spring({frame: frame - scene.from, fps, config: {damping: 16, mass: 0.7}});
  const lerp = (a: number, b: number) => a + (b - a) * move;
  const pipBox = {left: lerp(from.left, target.left), top: lerp(from.top, target.top), width: lerp(from.width, target.width)};

  const cta = scenes.find((s) => s.role === 'cta');
  const hook = scenes.find((s) => s.role === 'hook');
  const showBadge = scene.role === 'fact' || scene.role === 'recap';

  return (
    <ThemeContext.Provider value={th}>
    <StyleContext.Provider value={style}>
    <AbsoluteFill style={{backgroundColor: th.bg}}>
      <Background sceneIndex={idx} sceneFrom={scene.from} />

      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames} layout="none">
          <SceneBody scene={s} index={i} factIndex={scenes.slice(0, i).filter((x) => x.role === 'fact').length} last={i === scenes.length - 1} title={title} ctaLabel={ctaLabel} />
        </Sequence>
      ))}

      {scenes.map((s, i) => (i > 0 && transitionFor(i, style.cuts) === 'wipe' ? <Wipe key={`w${i}`} at={s.from} dir={i % 2 ? 1 : -1} /> : null))}

      <Progress scenes={scenes} kind={style.progress} total={totalFrames} />

      {showBadge ? (
        <div style={{position: 'absolute', top: 236, ...(style.side === 'left' ? {right: 70} : {left: 70}), fontFamily: FONT, fontWeight: 700, fontSize: 36, color: th.onAccent, background: th.accent, borderRadius: 10, padding: '6px 24px'}}>{title}</div>
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
      {sfx && hook && style.hook !== 'search' ? (
        <Sequence from={hook.from + 10} durationInFrames={10} layout="none">
          <Audio src={staticFile('sfx/pop.wav')} volume={0.3} />
        </Sequence>
      ) : null}
      {sfx && hook && style.hook === 'search' ? (
        <>
          <Sequence from={hook.from + TYPE_START} durationInFrames={typedEnd(hook.headline, TYPE_START, hookSpeed(hook)) - TYPE_START} layout="none">
            <Audio src={staticFile('sfx/typing.wav')} volume={0.3} />
          </Sequence>
          <Sequence from={hook.from + hookClick(hook)} durationInFrames={10} layout="none">
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
    </StyleContext.Provider>
    </ThemeContext.Provider>
  );
};
