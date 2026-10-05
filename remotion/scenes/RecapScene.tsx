import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Scene} from '../../src/schema';
import {pop, prog, push} from '../motion';
import {FONT, useTheme} from '../theme';
import {Card, Headline, Stage} from './common';

export const RecapScene: React.FC<{scene: Scene}> = ({scene}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const bullets = scene.bullets ?? [];
  return (
    <>
      <Headline text={scene.headline} highlight={scene.highlight} />
      <Stage>
        <div style={{display: 'flex', flexDirection: 'column', gap: 26}}>
          {bullets.map((b, i) => {
            const start = 8 + i * 12;
            const p = push(frame, fps, start);
            const check = pop(frame, fps, start + 6, 8);
            const tick = prog(frame, start + 8, 10);
            return (
              <Card key={i} style={{width: 860, padding: '24px 34px', display: 'flex', alignItems: 'center', gap: 26, opacity: Math.min(1, p * 2), translate: `${(1 - p) * 220}px 0`}}>
                <svg width={64} height={64} viewBox="0 0 64 64" style={{flexShrink: 0, scale: `${check}`}}>
                  <circle cx={32} cy={32} r={30} fill={th.accent} />
                  <path d="M18,33 L28,43 L47,22" stroke={th.onAccent} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={50} strokeDashoffset={50 * (1 - tick)} />
                </svg>
                <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: th.ink}}>{b}</div>
              </Card>
            );
          })}
        </div>
      </Stage>
    </>
  );
};
