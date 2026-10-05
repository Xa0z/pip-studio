import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog, punch} from '../motion';
import {FONT, useTheme} from '../theme';
import {Stage} from './common';

type V = Extract<Visual, {layout: 'iconGrid'}>;

export const IconGridScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = visual.count;
  const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const size = Math.min(260, Math.floor(820 / cols) - 24);
  const step = Math.max(1, Math.floor(30 / n));
  const first = 4;
  const last = first + (n - 1) * step;
  // The counter ticks up as each icon lands.
  const shown = Math.min(n, Math.max(0, Math.floor((frame - first) / step) + 1));
  const label = prog(frame, 2, 12);
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30}}>
        <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 20}}>
          {new Array(n).fill(0).map((_, i) => {
            const s = pop(frame, fps, first + i * step, 9);
            const wave = frame > last + 10 ? Math.sin((frame - last) / 8 - i * 0.6) * 4 : 0;
            return <Icon key={i} name={visual.icon} size={size} style={{scale: `${s}`, rotate: `${(1 - s) * -45}deg`, translate: `0 ${wave}px`}} />;
          })}
        </div>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 52, color: th.ink, textAlign: 'center', maxWidth: 900, opacity: label, translate: `0 ${(1 - label) * 30}px`}}>
          <span style={{display: 'inline-block', color: th.accent, fontVariantNumeric: 'tabular-nums', scale: `${punch(frame, last, 0.18, 12)}`}}>{shown}</span> {visual.label}
        </div>
      </div>
    </Stage>
  );
};
