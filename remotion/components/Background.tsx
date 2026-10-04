import React, {useMemo} from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {COLORS, HEIGHT, WIDTH} from '../theme';

// Same seed every video, so the sky always looks like Pip's world.
const STAR_COUNT = 140;

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const stars = useMemo(
    () =>
      new Array(STAR_COUNT).fill(0).map((_, i) => ({
        x: random(`x${i}`) * WIDTH,
        y: random(`y${i}`) * HEIGHT,
        r: 1 + random(`r${i}`) * 2.6,
        speed: 0.15 + random(`s${i}`) * 0.5,
        phase: random(`p${i}`) * Math.PI * 2,
      })),
    [],
  );

  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, #1A1550 50%, ${COLORS.bgBottom} 100%)`}}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(circle at 20% 30%, rgba(61,245,255,0.10), transparent 45%), radial-gradient(circle at 85% 75%, rgba(255,122,26,0.10), transparent 40%)',
        }}
      />
      <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute'}}>
        {stars.map((s, i) => {
          const y = (s.y + frame * s.speed) % HEIGHT;
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame / 18 + s.phase));
          return <circle key={i} cx={s.x} cy={y} r={s.r} fill="#fff" opacity={twinkle} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};
