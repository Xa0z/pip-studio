import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {push} from '../motion';
import {useTheme} from '../theme';

type P = [number, number];
// Where the four backdrop shapes sit for each scene. They glide to the next set on every cut,
// so the background moves with the edit instead of sitting still. Kept to the edges, away from text.
const LAYOUTS: {circle: P; square: P; ring: P; dots: P}[] = [
  {circle: [-180, 1180], square: [800, 120], ring: [860, 1500], dots: [90, 120]},
  {circle: [700, 1240], square: [-120, 520], ring: [80, 1560], dots: [860, 560]},
  {circle: [-220, 380], square: [820, 1460], ring: [880, 300], dots: [110, 1600]},
  {circle: [660, -160], square: [-90, 1360], ring: [120, 300], dots: [860, 1240]},
];

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Flat backdrop with a thin frame line, plus a few large, quiet shapes that drift. No gradients, no glow. */
export const Background: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = LAYOUTS[Math.max(0, sceneIndex - 1) % LAYOUTS.length];
  const to = LAYOUTS[sceneIndex % LAYOUTS.length];
  const t = sceneIndex === 0 ? 1 : push(frame, fps, sceneFrom - 4);
  const drift = (k: number): P => [Math.sin(frame / 70 + k) * 18, Math.cos(frame / 85 + k) * 22];
  const at = (key: keyof (typeof LAYOUTS)[number], k: number) => {
    const p = lerp(from[key], to[key], t);
    const d = drift(k);
    return {left: p[0] + d[0], top: p[1] + d[1]};
  };
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      <div style={{position: 'absolute', ...at('circle', 0), width: 560, height: 560, borderRadius: 280, background: th.marker, opacity: 0.45}} />
      <div style={{position: 'absolute', ...at('square', 1.7), width: 300, height: 300, borderRadius: 60, background: th.track, rotate: `${frame * 0.12 + t * 30}deg`}} />
      <div style={{position: 'absolute', ...at('ring', 3.1), width: 200, height: 200, borderRadius: 100, border: `16px solid ${th.accentSoft}`, opacity: 0.4}} />
      <div style={{position: 'absolute', ...at('dots', 4.2), display: 'grid', gridTemplateColumns: 'repeat(4, 14px)', gap: 22, opacity: 0.35}}>
        {new Array(16).fill(0).map((_, i) => (
          <div key={i} style={{width: 14, height: 14, borderRadius: 7, background: th.inkMuted}} />
        ))}
      </div>
      <div style={{position: 'absolute', inset: 28, border: `3px solid ${th.line}`, borderRadius: 36}} />
    </AbsoluteFill>
  );
};
