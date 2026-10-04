import React from 'react';
import {useCurrentFrame} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {COLORS, FONT} from '../theme';
import {Card, Stage, useIn} from './common';

type V = Extract<Visual, {layout: 'spotlight'}>;

export const SpotlightScene: React.FC<{visual: V}> = ({visual}) => {
  const frame = useCurrentFrame();
  const p = useIn(2, 10);
  const c = useIn(12);
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{position: 'relative', width: 380, height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <svg width={520} height={520} viewBox="-260 -260 520 520" style={{position: 'absolute', transform: `rotate(${frame * 0.6}deg)`, opacity: 0.5}}>
            {new Array(12).fill(0).map((_, i) => (
              <path key={i} d="M0,0 L-22,-250 L22,-250Z" fill={i % 2 ? COLORS.yellow : COLORS.orange} opacity={0.35} transform={`rotate(${i * 30})`} />
            ))}
          </svg>
          <div style={{position: 'absolute', width: 300, height: 300, borderRadius: 150, background: 'radial-gradient(circle, rgba(61,245,255,0.35), transparent 70%)'}} />
          <div style={{transform: `scale(${p}) translateY(${Math.sin(frame / 14) * 8}px)`}}>
            <Icon name={visual.icon} size={300} />
          </div>
        </div>
        <Card style={{marginTop: 10, padding: '24px 40px', maxWidth: 880, opacity: c, transform: `translateY(${(1 - c) * 40}px)`}}>
          <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: COLORS.white, textAlign: 'center'}}>{visual.caption}</div>
        </Card>
      </div>
    </Stage>
  );
};
