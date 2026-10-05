import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Scene} from '../../src/schema';
import {pop} from '../motion';
import {FONT, useTheme} from '../theme';
import {KineticText} from './common';

export const HookScene: React.FC<{scene: Scene; title: string}> = ({scene, title}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const badge = pop(frame, fps, 0, 9);
  return (
    <>
      <div style={{position: 'absolute', top: 230, width: 1080, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 46,
            color: th.onAccent,
            background: th.accent,
            borderRadius: 12,
            padding: '10px 34px',
            translate: `0 ${(1 - badge) * -160}px`,
            rotate: `${interpolate(badge, [0, 1], [-14, -2])}deg`,
            opacity: Math.min(1, badge * 2),
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 350,
          left: 60,
          width: 960,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: scene.headline.length > 30 ? 86 : 104,
          lineHeight: 1.08,
          letterSpacing: -1.5,
          color: th.ink,
        }}
      >
        <KineticText text={scene.headline} highlight={scene.highlight} delay={6} stagger={4} />
      </div>
    </>
  );
};
