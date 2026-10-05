import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {luminance} from '../../src/themes';
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

/** Backdrop: soft blurred light in the theme colours that drifts and moves to a new spot on every cut. */
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
  const dark = luminance(th.bg) < 0.18;
  const blob = (key: keyof (typeof LAYOUTS)[number], k: number, size: number, color: string, opacity: number) => {
    const p = at(key, k);
    return <div style={{position: 'absolute', left: p.left - size / 4, top: p.top - size / 4, width: size, height: size, borderRadius: size / 2, background: color, opacity, filter: 'blur(130px)'}} />;
  };
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      {/* Soft ambient light in the theme colours, drifting and re-framing on every cut. */}
      {blob('circle', 0, 760, th.accent, dark ? 0.45 : 0.28)}
      {blob('square', 1.7, 620, th.accentSoft, dark ? 0.3 : 0.55)}
      {blob('ring', 3.1, 520, th.accent2, dark ? 0.35 : 0.22)}
    </AbsoluteFill>
  );
};
