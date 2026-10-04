import React from 'react';
import {useCurrentFrame} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {Stage, useIn} from './common';

type V = Extract<Visual, {layout: 'orbit'}>;

export const OrbitScene: React.FC<{visual: V}> = ({visual}) => {
  const frame = useCurrentFrame();
  const p = useIn(2);
  const a = frame / 22;
  const rx = 330;
  const ry = 130;
  const x = Math.cos(a) * rx;
  const y = Math.sin(a) * ry;
  const behind = Math.sin(a) < 0;
  const sat = <div style={{position: 'absolute', left: 540 + x - 60, top: 230 + y - 60, transform: `scale(${behind ? 0.8 : 1.1})`}}><Icon name={visual.satellite} size={120} /></div>;
  return (
    <Stage>
      <div style={{position: 'relative', width: 1080, height: 560, opacity: p, transform: `scale(${0.8 + 0.2 * p})`}}>
        <svg width={1080} height={460} style={{position: 'absolute', top: 0, left: 0}}>
          <ellipse cx={540} cy={230} rx={rx} ry={ry} fill="none" stroke={COLORS.sage2} strokeOpacity={0.7} strokeWidth={4} strokeDasharray="14 14" />
        </svg>
        {behind ? sat : null}
        <div style={{position: 'absolute', left: 540 - 130, top: 230 - 130}}>
          <Icon name={visual.center} size={260} />
        </div>
        {behind ? null : sat}
        <div style={{position: 'absolute', top: 440, width: 1080, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 52, color: COLORS.ink}}>{visual.label}</div>
      </div>
    </Stage>
  );
};
