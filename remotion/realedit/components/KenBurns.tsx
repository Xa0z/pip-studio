import React from 'react';
import {Easing, Img, interpolate, useCurrentFrame} from 'remotion';
import type {RealShot} from '../types';

const ease = Easing.bezier(0.45, 0, 0.55, 1);

/** A still photo that is never static: slow eased zoom (1.0 to 1.08) with a gentle pan. */
export const KenBurns: React.FC<{src: string; move: NonNullable<RealShot['kenBurns']>; focusY: number; duration: number}> = ({src, move, focusY, duration}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, Math.max(1, duration - 1)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
  const s = move.fromScale + (move.toScale - move.fromScale) * p;
  const x = move.fromX + (move.toX - move.fromX) * p;
  const y = move.fromY + (move.toY - move.fromY) * p;
  return (
    <Img
      src={src}
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `50% ${focusY * 100}%`, transform: `translate(${x}px, ${y}px) scale(${s})`}}
    />
  );
};
