import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog, push} from '../motion';
import {FONT, useTheme} from '../theme';
import {Card, Stage} from './common';

type V = Extract<Visual, {layout: 'steps'}>;

export const StepsScene: React.FC<{visual: V; durationInFrames: number}> = ({visual, durationInFrames}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = visual.steps.length;
  const gap = Math.min(30, Math.floor((durationInFrames * 0.6) / n));
  const big = n <= 3;
  const rowGap = 44;
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: rowGap}}>
        {visual.steps.map((s, i) => {
          const start = 4 + i * gap;
          const p = push(frame, fps, start);
          const badge = pop(frame, fps, start + 4, 8);
          // The newest step wears the accent border until the next one arrives.
          const next = i < n - 1 ? 4 + (i + 1) * gap : Infinity;
          const active = interpolate(frame, [start, start + 4, next, next + 6], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const link = i > 0 ? prog(frame, start - 6, 10) : 0;
          return (
            <div key={i} style={{position: 'relative'}}>
              {i > 0 ? (
                <div style={{position: 'absolute', left: (big ? 34 : 30) + 3 + 32 - 3, top: -rowGap - 4, width: 6, height: (rowGap + 8) * link, background: th.accent2, borderRadius: 3}} />
              ) : null}
              <Card
                style={{
                  width: 820,
                  padding: big ? '22px 34px' : '14px 30px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 28,
                  opacity: Math.min(1, p * 2),
                  translate: `${(1 - p) * (i % 2 ? 140 : -140)}px 0`,
                  borderColor: active > 0.5 ? th.accent : th.line,
                  scale: `${1 + active * 0.02}`,
                }}
              >
                <div style={{width: 64, height: 64, borderRadius: 32, background: th.accent, color: th.onAccent, fontFamily: FONT, fontWeight: 700, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, scale: `${badge}`}}>{i + 1}</div>
                <Icon name={s.icon} size={big ? 100 : 80} style={{rotate: `${(1 - badge) * 30}deg`}} />
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: th.ink}}>{s.text}</div>
              </Card>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
