import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {formatNumber, Stage} from './common';

type V = Extract<Visual, {layout: 'compare'}>;
const BAR_COLORS = [COLORS.sage, COLORS.sage2, COLORS.mint, COLORS.inkMuted];

export const CompareScene: React.FC<{visual: V}> = ({visual}) => {
  const frame = useCurrentFrame();
  const max = Math.max(...visual.items.map((i) => i.value));
  return (
    <Stage>
      <div style={{width: 920, display: 'flex', flexDirection: 'column', gap: visual.items.length > 3 ? 26 : 40}}>
        {visual.items.map((item, i) => {
          const start = 6 + i * 10;
          const grow = interpolate(frame, [start, start + 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const share = Math.max(0.04, item.value / max);
          const decimals = item.value % 1 === 0 ? 0 : 1;
          return (
            <div key={i} style={{opacity: interpolate(frame, [start - 4, start + 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10}}>
                <Icon name={item.icon} size={70} />
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: COLORS.ink}}>{item.label}</div>
                <div style={{marginLeft: 'auto', fontFamily: FONT, fontWeight: 700, fontSize: 44, color: COLORS.ink, fontVariantNumeric: 'tabular-nums'}}>
                  {formatNumber(item.value * grow, decimals)} {visual.unit}
                </div>
              </div>
              <div style={{height: 40, background: COLORS.track, borderRadius: 10, overflow: 'hidden'}}>
                <div style={{width: `${share * grow * 100}%`, height: '100%', background: BAR_COLORS[i % 4], borderRadius: 10}} />
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
