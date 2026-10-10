import React from 'react';
import {AbsoluteFill} from 'remotion';

/** Soft vignette: edges a little darker, slightly off-centre like a real lens on a phone. */
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{background: 'radial-gradient(ellipse 78% 62% at 50% 46%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.34) 100%)', pointerEvents: 'none'}} />
);
