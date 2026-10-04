import React from 'react';
import {interpolate} from 'remotion';
import type {Scene} from '../../src/schema';
import {COLORS, FONT} from '../theme';
import {Highlighted, useIn} from './common';

export const HookScene: React.FC<{scene: Scene; title: string}> = ({scene, title}) => {
  const badge = useIn(0, 12);
  const text = useIn(3, 12);
  return (
    <>
      <div style={{position: 'absolute', top: 230, width: 1080, display: 'flex', justifyContent: 'center', opacity: badge, transform: `scale(${0.7 + 0.3 * badge})`}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 46, color: '#1B1F3B', background: COLORS.yellow, borderRadius: 40, padding: '10px 34px'}}>{title}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 340,
          left: 60,
          width: 960,
          textAlign: 'center',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: scene.headline.length > 30 ? 84 : 100,
          lineHeight: 1.05,
          color: COLORS.white,
          textShadow: '0 8px 30px rgba(0,0,0,0.4)',
          opacity: text,
          transform: `scale(${interpolate(text, [0, 1], [1.25, 1])})`,
        }}
      >
        <Highlighted text={scene.headline} highlight={scene.highlight} />
      </div>
    </>
  );
};
