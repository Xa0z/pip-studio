import React from 'react';
import {useCurrentFrame} from 'remotion';
import type {Scene} from '../../src/schema';
import {COLORS, FONT} from '../theme';
import {Highlighted, useIn} from './common';

export const CtaScene: React.FC<{scene: Scene; label?: string}> = ({scene, label = '+ Follow Pip'}) => {
  const frame = useCurrentFrame();
  const t = useIn(0, 12);
  const b = useIn(10, 8);
  const pulse = 1 + Math.sin(frame / 6) * 0.03;
  return (
    <>
      <div style={{position: 'absolute', top: 330, left: 60, width: 960, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 90, lineHeight: 1.05, color: COLORS.white, opacity: t, transform: `translateY(${(1 - t) * 40}px)`}}>
        <Highlighted text={scene.headline} highlight={scene.highlight} />
      </div>
      <div style={{position: 'absolute', top: 590, width: 1080, display: 'flex', justifyContent: 'center', transform: `scale(${b * pulse})`}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 54, color: COLORS.white, background: COLORS.orange, borderRadius: 50, padding: '14px 50px', boxShadow: '0 10px 40px rgba(255,122,26,0.5)'}}>{label}</div>
      </div>
    </>
  );
};
