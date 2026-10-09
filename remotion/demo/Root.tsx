import React from 'react';
import {Composition} from 'remotion';
import {Demo, FPS, H, TOTAL, W} from './Demo';

export const DemoRoot: React.FC = () => (
  <Composition id="Demo" component={Demo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{sfx: true}} />
);
