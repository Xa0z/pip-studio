import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog} from '../motion';
import {FONT, useTheme} from '../theme';
import {Stage} from './common';

type V = Extract<Visual, {layout: 'orbit'}>;

const RX = 330;
const RY = 130;
const CX = 540;
const CY = 230;

export const OrbitScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const center = pop(frame, fps, 2, 10);
  const path = prog(frame, 4, 24);
  const sat = pop(frame, fps, 14, 10);
  const label = prog(frame, 16, 14);
  // Speeds up from rest so the satellite feels thrown into orbit.
  const a = frame < 14 ? 0 : ((frame - 14) / 22) * Math.min(1, (frame - 14) / 30 + 0.3);
  const at = (k: number) => ({x: Math.cos(a - k) * RX, y: Math.sin(a - k) * RY, behind: Math.sin(a - k) < 0});
  const perimeter = Math.PI * (3 * (RX + RY) - Math.sqrt((3 * RX + RY) * (RX + 3 * RY)));
  const satellite = (k: number, size: number, opacity: number, key: string) => {
    const s = at(k);
    const depth = s.behind ? 0.8 : 1.1;
    return (
      <div key={key} style={{position: 'absolute', left: CX + s.x - size / 2, top: CY + s.y - size / 2, scale: `${depth * sat}`, opacity}}>
        <Icon name={visual.satellite} size={size} />
      </div>
    );
  };
  const trail = [0.32, 0.2, 0.1].map((k, i) => ({k, opacity: [0.35, 0.22, 0.12][i] * sat}));
  const behind = at(0).behind;
  return (
    <Stage>
      <div style={{position: 'relative', width: 1080, height: 560}}>
        <svg width={1080} height={460} style={{position: 'absolute', top: 0, left: 0}}>
          <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={th.accent2} strokeOpacity={0.7} strokeWidth={4} strokeDasharray={`${perimeter * path} ${perimeter}`} />
        </svg>
        {trail.filter((t) => at(t.k).behind).map((t, i) => satellite(t.k, 90, t.opacity, `tb${i}`))}
        {behind ? satellite(0, 120, 1, 's') : null}
        <div style={{position: 'absolute', left: CX - 130, top: CY - 130, scale: `${center * (1 + Math.sin(frame / 18) * 0.03)}`}}>
          <Icon name={visual.center} size={260} />
        </div>
        {trail.filter((t) => !at(t.k).behind).map((t, i) => satellite(t.k, 90, t.opacity, `tf${i}`))}
        {behind ? null : satellite(0, 120, 1, 's')}
        <div style={{position: 'absolute', top: 440, width: 1080, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 52, color: th.ink, opacity: label, translate: `0 ${(1 - label) * 30}px`}}>{visual.label}</div>
      </div>
    </Stage>
  );
};
