import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimedScene} from '../../src/schema';
import {EASE_OUT, pop, prog, punch} from '../motion';
import {FONT, ThemeContext, useTheme} from '../theme';
import {RiseText, StampText} from './common';

/**
 * Opening as a title card: a thick card drops in tilted, swings flat (a real 3D swing, with
 * perspective), and the question stamps onto it word by word.
 */
export const CardHook: React.FC<{scene: TimedScene; title: string}> = ({scene, title}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const drop = pop(frame, fps, 0, 12);
  const swing = interpolate(frame, [0, 20], [-55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_OUT});
  const tag = pop(frame, fps, 14, 10);
  const size = scene.headline.length > 34 ? 72 : scene.headline.length > 22 ? 84 : 100;
  const lastWord = 10 + scene.headline.split(/\s+/).length * 4;
  return (
    <div style={{position: 'absolute', top: 250, left: 0, width: 1080, height: 520, perspective: 1400}}>
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 40,
          width: 940,
          minHeight: 400,
          boxSizing: 'border-box',
          padding: '70px 56px 56px',
          background: th.surface,
          border: `5px solid ${th.ink}`,
          borderRadius: 36,
          boxShadow: `0 18px 0 ${th.accent}`,
          transformOrigin: '50% 0%',
          transform: `translateY(${(1 - drop) * -260}px) rotateX(${swing}deg) rotateZ(${(1 - drop) * -6}deg) scale(${punch(frame, lastWord, 0.03, 10)})`,
          opacity: Math.min(1, drop * 2),
        }}
      >
        <div style={{fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.06, letterSpacing: -1.5, color: th.ink}}>
          <StampText text={scene.headline} highlight={scene.highlight} delay={10} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 8,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 38,
          color: th.onAccent,
          background: th.accent,
          borderRadius: 10,
          padding: '8px 26px',
          scale: `${tag}`,
          rotate: `${(1 - tag) * 14 - 3}deg`,
        }}
      >
        {title}
      </div>
    </div>
  );
};

/**
 * Opening as a poster: a flat accent panel slides down over the top of the screen and the
 * question rises onto it in big type, with a thin rule drawing underneath.
 */
export const PosterHook: React.FC<{scene: TimedScene; title: string}> = ({scene, title}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const panel = prog(frame, 0, 14, EASE_OUT);
  const rule = prog(frame, 16, 18);
  const size = scene.headline.length > 34 ? 92 : scene.headline.length > 22 ? 108 : 126;
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: 760, background: th.accent, translate: `0 ${(panel - 1) * 780}px`}} />
      <div style={{position: 'absolute', left: 0, top: 752, width: 1080, height: 16, background: th.accentSoft, translate: `${(rule - 1) * 1080}px 0`}} />
      <div style={{position: 'absolute', left: 72, top: 170, fontFamily: FONT, fontWeight: 700, fontSize: 40, letterSpacing: 4, textTransform: 'uppercase', color: th.onAccent, opacity: prog(frame, 8, 10)}}>
        {title}
      </div>
      <div style={{position: 'absolute', left: 72, top: 260, width: 936, fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -2, color: th.onAccent}}>
        <PosterWords text={scene.headline} highlight={scene.highlight} />
      </div>
    </>
  );
};

/** RiseText on the accent panel: text in the on-accent colour, highlights in the soft accent. */
const PosterWords: React.FC<{text: string; highlight: string[]}> = ({text, highlight}) => {
  const th = useTheme();
  return (
    <ThemeContext.Provider value={{...th, ink: th.onAccent, accent: th.accentSoft, marker: th.accent}}>
      <RiseText text={text} highlight={highlight} delay={8} stagger={3} />
    </ThemeContext.Provider>
  );
};
