import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useTheme} from '../theme';

/** Flat stone backdrop with a thin frame line, like a printed card. No gradients, no particles. */
export const Background: React.FC = () => {
  const th = useTheme();
  return (
  <AbsoluteFill style={{background: th.bg}}>
    <div style={{position: 'absolute', inset: 28, border: `3px solid ${th.line}`, borderRadius: 36}} />
  </AbsoluteFill>
  );
};
