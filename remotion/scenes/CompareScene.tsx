import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {formatNumber, Stage} from './common';

type V = Extract<Visual, {layout: 'compare'}>;
const BAR_COLORS = [COLORS.orange, COLORS.cyan, COLORS.yellow, '#FF6FAE'];

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
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: COLORS.white}}>{item.label}</div>
              </div>
              <div style={{height: 64, background: 'rgba(255,255,255,0.08)', borderRadius: 32, overflow: 'hidden', position: 'relative'}}>
                <div style={{width: `${share * grow * 100}%`, height: '100%', background: BAR_COLORS[i % 4], borderRadius: 32}} />
                <div style={{position: 'absolute', right: 24, top: 0, height: 64, display: 'flex', alignItems: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 40, color: COLORS.white, textShadow: '0 2px 8px rgba(0,0,0,0.6)'}}>
                  {formatNumber(item.value * grow, decimals)} {visual.unit}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
