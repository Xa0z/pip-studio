import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog} from '../motion';
import {FONT, useTheme} from '../theme';
import {Card, KineticText, Stage} from './common';

type V = Extract<Visual, {layout: 'spotlight'}>;

export const SpotlightScene: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const disc = pop(frame, fps, 0, 14);
  const drop = pop(frame, fps, 4, 7);
  // Squash on landing, then stretch back: the classic bouncing-ball feel.
  const squash = interpolate(frame, [10, 13, 18], [1, 0.86, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const c = prog(frame, 14, 14);
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{position: 'relative', width: 380, height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          {[0, 1].map((k) => {
            const cycle = ((frame - 12 + k * 22) % 44) / 44;
            if (frame < 12) return null;
            return <div key={k} style={{position: 'absolute', width: 360, height: 360, borderRadius: 180, border: `3px solid ${th.accentSoft}`, scale: `${1 + cycle * 0.35}`, opacity: 0.8 * (1 - cycle)}} />;
          })}
          <div style={{position: 'absolute', width: 360, height: 360, borderRadius: 180, background: th.surface, border: `3px solid ${th.line}`, scale: `${disc}`}} />
          <div style={{translate: `0 ${(1 - drop) * -260 + Math.sin(frame / 14) * 6}px`, scale: `${1 / squash} ${squash}`, transformOrigin: '50% 100%'}}>
            <Icon name={visual.icon} size={300} />
          </div>
        </div>
        <Card style={{marginTop: 10, padding: '24px 40px', maxWidth: 880, opacity: c, translate: `0 ${(1 - c) * 40}px`}}>
          <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: th.ink, textAlign: 'center'}}>
            <KineticText text={visual.caption} highlight={[]} delay={16} stagger={2} />
          </div>
        </Card>
      </div>
    </Stage>
  );
};
