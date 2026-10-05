import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {FONT, useTheme} from '../theme';
import {Card, formatNumber, Stage, useIn} from './common';

type V = Extract<Visual, {layout: 'bigNumber'}>;

export const BigNumberScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const pop = useIn(4);
  const value = interpolate(frame, [6, 46], [0, visual.value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const text = `${visual.prefix ?? ''}${formatNumber(value, visual.decimals ?? 0)}`;
  const fontSize = text.length > 9 ? 120 : text.length > 6 ? 150 : 190;
  return (
    <Stage>
      <Card style={{width: 900, padding: '50px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${0.85 + 0.15 * pop})`, opacity: pop}}>
        <Icon name={visual.icon} size={150} style={{transform: `rotate(${Math.sin(frame / 20) * 6}deg)`}} />
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize, color: th.accent, lineHeight: 1.05, marginTop: 10}}>
          {text}
          {visual.unit ? <span style={{fontSize: fontSize * 0.42, color: th.ink, marginLeft: 14}}>{visual.unit}</span> : null}
        </div>
        <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: th.inkMuted, textAlign: 'center', marginTop: 10}}>{visual.label}</div>
      </Card>
    </Stage>
  );
};
