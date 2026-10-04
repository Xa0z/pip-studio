import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import type {Scene} from '../../src/schema';
import {COLORS, FONT} from '../theme';
import {Card, Headline, Stage} from './common';

export const RecapScene: React.FC<{scene: Scene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const bullets = scene.bullets ?? [];
  return (
    <>
      <Headline text={scene.headline} highlight={scene.highlight} />
      <Stage>
        <div style={{display: 'flex', flexDirection: 'column', gap: 26}}>
          {bullets.map((b, i) => {
            const start = 6 + i * 12;
            const p = interpolate(frame, [start, start + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (
              <Card key={i} style={{width: 860, padding: '24px 34px', display: 'flex', alignItems: 'center', gap: 26, opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}>
                <svg width={64} height={64} viewBox="0 0 64 64" style={{flexShrink: 0}}>
                  <circle cx={32} cy={32} r={30} fill={COLORS.orange} />
                  <path d="M18,33 L28,43 L47,22" stroke="#fff" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={50} strokeDashoffset={50 * (1 - p)} />
                </svg>
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: COLORS.white}}>{b}</div>
              </Card>
            );
          })}
        </div>
      </Stage>
    </>
  );
};
