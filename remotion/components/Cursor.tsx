import React from 'react';
import {useTheme} from '../theme';

/** A plain arrow pointer, like a screen recording. `press` 0..1 squeezes it on a click. */
export const Cursor: React.FC<{x: number; y: number; press?: number; opacity?: number}> = ({x, y, press = 0, opacity = 1}) => {
  const th = useTheme();
  return (
    <svg width={64} height={76} viewBox="0 0 32 38" style={{position: 'absolute', left: x, top: y, opacity, scale: `${1 - press * 0.18}`, transformOrigin: '0 0', overflow: 'visible'}}>
      <path d="M2 2 L2 30 L9.5 23.5 L14.5 35 L19.5 33 L14.5 21.5 L25 21.5 Z" fill={th.ink} stroke={th.surface} strokeWidth={2.4} strokeLinejoin="round" />
    </svg>
  );
};

/** Rings that spread from a click point. */
export const ClickRipple: React.FC<{x: number; y: number; p: number; size?: number}> = ({x, y, p, size = 120}) => {
  const th = useTheme();
  if (p <= 0 || p >= 1) return null;
  return <div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, border: `5px solid ${th.accent}`, scale: `${0.3 + p}`, opacity: 1 - p}} />;
};
