import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {Stage} from './common';

type V = Extract<Visual, {layout: 'iconGrid'}>;

export const IconGridScene: React.FC<{visual: V}> = ({visual}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = visual.count;
  const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const size = Math.min(260, Math.floor(820 / cols) - 24);
  const step = Math.max(1, Math.floor(30 / n));
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30}}>
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 20}}>
          {new Array(n).fill(0).map((_, i) => {
            const s = spring({frame: frame - 4 - i * step, fps, config: {damping: 10, mass: 0.5}});
            return <Icon key={i} name={visual.icon} size={size} style={{transform: `scale(${s})`}} />;
          })}
        </div>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 52, color: COLORS.ink, textAlign: 'center', maxWidth: 900}}>
          <span style={{color: COLORS.sage}}>{n}</span> {visual.label}
        </div>
      </div>
    </Stage>
  );
};
