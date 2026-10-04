import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {Card, Stage} from './common';

type V = Extract<Visual, {layout: 'steps'}>;

export const StepsScene: React.FC<{visual: V; durationInFrames: number}> = ({visual, durationInFrames}) => {
  const frame = useCurrentFrame();
  const n = visual.steps.length;
  const gap = Math.min(30, Math.floor((durationInFrames * 0.6) / n));
  const big = n <= 3;
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
        {visual.steps.map((s, i) => {
          const start = 4 + i * gap;
          const p = interpolate(frame, [start, start + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <React.Fragment key={i}>
              {i > 0 ? <div style={{fontFamily: FONT, fontSize: 44, color: COLORS.cyan, opacity: p, lineHeight: 0.8}}>▼</div> : null}
              <Card style={{width: 820, padding: big ? '22px 34px' : '14px 30px', display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateX(${(1 - p) * (i % 2 ? 80 : -80)}px)`}}>
                <div style={{width: 64, height: 64, borderRadius: 32, background: COLORS.orange, color: COLORS.white, fontFamily: FONT, fontWeight: 700, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>{i + 1}</div>
                <Icon name={s.icon} size={big ? 100 : 80} />
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: COLORS.white}}>{s.text}</div>
              </Card>
            </React.Fragment>
          );
        })}
      </div>
    </Stage>
  );
};
