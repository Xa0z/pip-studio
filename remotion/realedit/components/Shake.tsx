import {noise2D} from '@remotion/noise';
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';

/** Handheld feel: 1-2 px of smooth noise and a hair of rotation. Used on some shots only. */
export const Shake: React.FC<{seed: number | null; children: React.ReactNode}> = ({seed, children}) => {
  const frame = useCurrentFrame();
  if (seed === null) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = frame * 0.035;
  const x = noise2D(`x${seed}`, t, 0) * 1.6;
  const y = noise2D(`y${seed}`, t, 0.5) * 1.4;
  const r = noise2D(`r${seed}`, t * 0.7, 1) * 0.08;
  return <AbsoluteFill style={{transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(1.012)`}}>{children}</AbsoluteFill>;
};
