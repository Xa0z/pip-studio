import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog} from '../motion';
import {FONT, useTheme} from '../theme';
import {formatNumber, Stage} from './common';

type V = Extract<Visual, {layout: 'compare'}>;

export const CompareScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const BAR_COLORS = [th.accent, th.accent2, th.accentSoft, th.inkMuted];
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const max = Math.max(...visual.items.map((i) => i.value));
  const winner = visual.items.findIndex((i) => i.value === max);
  const lastDone = 6 + (visual.items.length - 1) * 9 + 30;
  return (
    <Stage>
      <div style={{width: 920, display: 'flex', flexDirection: 'column', gap: visual.items.length > 3 ? 26 : 40}}>
        {visual.items.map((item, i) => {
          const start = 6 + i * 9;
          const row = prog(frame, start - 4, 12);
          // A spring that overshoots slightly, so the bar "lands" instead of just stopping.
          const grow = pop(frame, fps, start, 14);
          const count = prog(frame, start, 26);
          const share = Math.max(0.04, item.value / max);
          const decimals = item.value % 1 === 0 ? 0 : 1;
          const isWinner = i === winner && visual.items.length > 1;
          const crown = isWinner ? pop(frame, fps, lastDone, 9) : 0;
          return (
            <div key={i} style={{opacity: row, translate: `${(1 - row) * -60}px 0`}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10}}>
                <Icon name={item.icon} size={70} style={{scale: `${pop(frame, fps, start - 2, 9)}`}} />
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 46, color: th.ink}}>{item.label}</div>
                {isWinner ? (
                  <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 28, color: th.onAccent, background: th.accent, borderRadius: 8, padding: '2px 14px', scale: `${crown}`, rotate: `${(1 - crown) * -20}deg`}}>MOST</div>
                ) : null}
                <div style={{marginLeft: 'auto', fontFamily: FONT, fontWeight: 700, fontSize: 44, color: th.ink, fontVariantNumeric: 'tabular-nums'}}>
                  {formatNumber(item.value * count, decimals)} {visual.unit}
                </div>
              </div>
              <div style={{height: 40, background: th.track, borderRadius: 10, overflow: 'hidden'}}>
                <div style={{width: `${Math.min(1, share * grow) * 100}%`, height: '100%', background: BAR_COLORS[i % 4], borderRadius: 10}} />
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
