import React from 'react';
import {useCurrentFrame} from 'remotion';
import type {Scene} from '../../src/schema';
import {FONT, useTheme} from '../theme';
import {Highlighted, useIn} from './common';

export const CtaScene: React.FC<{scene: Scene; label?: string}> = ({scene, label = '+ Follow Pip'}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const t = useIn(0, 12);
  const b = useIn(10, 8);
  const pulse = 1 + Math.sin(frame / 6) * 0.03;
  return (
    <>
      <div style={{position: 'absolute', top: 330, left: 60, width: 960, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 90, lineHeight: 1.05, color: th.ink, opacity: t, transform: `translateY(${(1 - t) * 40}px)`}}>
        <Highlighted text={scene.headline} highlight={scene.highlight} />
      </div>
      <div style={{position: 'absolute', top: 590, width: 1080, display: 'flex', justifyContent: 'center', transform: `scale(${b * pulse})`}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 54, color: th.onAccent, background: th.accent, borderRadius: 16, padding: '18px 50px'}}>{label}</div>
      </div>
    </>
  );
};
