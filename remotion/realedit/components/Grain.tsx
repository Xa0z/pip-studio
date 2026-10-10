import React from 'react';
import {AbsoluteFill, random, staticFile, useCurrentFrame} from 'remotion';

/** Light film grain (about 3.5%): a noise tile that jumps to a new spot every other frame. */
export const Grain: React.FC<{file: string | null; opacity?: number}> = ({file, opacity = 0.035}) => {
  const frame = useCurrentFrame();
  if (!file) return null;
  const k = Math.floor(frame / 2);
  const x = Math.floor(random(`gx${k}`) * 512);
  const y = Math.floor(random(`gy${k}`) * 512);
  return (
    <AbsoluteFill
      style={{backgroundImage: `url(${staticFile(file)})`, backgroundSize: '512px 512px', backgroundPosition: `${x}px ${y}px`, opacity: opacity * 6, mixBlendMode: 'overlay', filter: 'contrast(0.6)', pointerEvents: 'none'}}
    />
  );
};
