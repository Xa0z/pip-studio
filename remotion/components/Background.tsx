import React from 'react';
import {AbsoluteFill} from 'remotion';
import {COLORS} from '../theme';

/** Flat stone backdrop with a thin frame line, like a printed card. No gradients, no particles. */
export const Background: React.FC = () => (
  <AbsoluteFill style={{background: COLORS.bg}}>
    <div style={{position: 'absolute', inset: 28, border: `3px solid ${COLORS.line}`, borderRadius: 36}} />
  </AbsoluteFill>
);
