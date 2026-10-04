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
          <div style={{position: 'absolute', width: 360, height: 360, borderRadius: 180, background: COLORS.surface, border: `3px solid ${COLORS.line}`}} />
          <div style={{transform: `scale(${p}) translateY(${Math.sin(frame / 14) * 6}px)`}}>
            <Icon name={visual.icon} size={300} />
          </div>
        </div>
        <Card style={{marginTop: 10, padding: '24px 40px', maxWidth: 880, opacity: c, transform: `translateY(${(1 - c) * 40}px)`}}>
          <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: COLORS.ink, textAlign: 'center'}}>{visual.caption}</div>
        </Card>
      </div>
    </Stage>
  );
};
