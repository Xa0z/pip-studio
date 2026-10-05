import React from 'react';
import {Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog, punch} from '../motion';
import {FONT, useTheme} from '../theme';
import {Burst, Card, formatNumber, Stage} from './common';

type V = Extract<Visual, {layout: 'bigNumber'}>;

const COUNT_FROM = 8;
const COUNT_TO = 46;

export const BigNumberScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const card = pop(frame, fps, 2, 13);
  const icon = pop(frame, fps, 6, 8);
  const value = interpolate(frame, [COUNT_FROM, COUNT_TO], [0, visual.value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.exp),
  });
  const ring = prog(frame, COUNT_FROM, COUNT_TO - COUNT_FROM, Easing.out(Easing.exp));
  const text = `${visual.prefix ?? ''}${formatNumber(value, visual.decimals ?? 0)}`;
  const fontSize = text.length > 9 ? 120 : text.length > 6 ? 150 : 190;
  const label = prog(frame, COUNT_TO - 6, 14);
  const R = 104;
  const C = 2 * Math.PI * R;
  return (
    <Stage>
      <Card style={{position: 'relative', width: 900, padding: '44px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', scale: `${0.8 + 0.2 * card}`, opacity: Math.min(1, card * 1.5), translate: `0 ${(1 - card) * 80}px`}}>
        <div style={{position: 'relative', width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <svg width={240} height={240} viewBox="0 0 240 240" style={{position: 'absolute', inset: 0, rotate: '-90deg'}}>
            <circle cx={120} cy={120} r={R} fill="none" stroke={th.track} strokeWidth={12} />
            <circle cx={120} cy={120} r={R} fill="none" stroke={th.accent} strokeWidth={12} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ring)} />
          </svg>
          <Icon name={visual.icon} size={150} style={{scale: `${icon}`, rotate: `${(1 - icon) * -40 + Math.sin(frame / 20) * 5}deg`}} />
        </div>
        <div style={{position: 'relative', fontFamily: FONT, fontWeight: 800, fontSize, color: th.accent, lineHeight: 1.05, marginTop: 10, fontVariantNumeric: 'tabular-nums', scale: `${punch(frame, COUNT_TO - 4, 0.1, 12)}`}}>
          {text}
          {visual.unit ? <span style={{fontSize: fontSize * 0.42, color: th.ink, marginLeft: 14}}>{visual.unit}</span> : null}
        </div>
        <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: th.inkMuted, textAlign: 'center', marginTop: 10, opacity: label, translate: `0 ${(1 - label) * 24}px`}}>{visual.label}</div>
        <Burst at={COUNT_TO - 4} x={450} y={390} radius={300} count={12} />
      </Card>
    </Stage>
  );
};
