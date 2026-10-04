/** App icon: Pip on the brand gradient. Render: npx remotion still remotion/index.ts Logo public/logo.png --frame=12 */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Pip} from './character/Pip';

export const Logo: React.FC = () => (
  <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 40%, #5B2A9E 0%, #2A1660 45%, #0B1030 100%)', alignItems: 'center', justifyContent: 'center'}}>
    <div style={{position: 'absolute', width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,122,26,0.35) 0%, rgba(255,122,26,0) 70%)'}} />
    <div style={{width: 700, marginTop: -40}}>
      <Pip expression="happy" pose="waving" />
    </div>
  </AbsoluteFill>
);
