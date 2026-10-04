import React from 'react';
import type {TimedScene} from '../../src/schema';
import {BigNumberScene} from './BigNumberScene';
import {Headline} from './common';
import {CompareScene} from './CompareScene';
import {IconGridScene} from './IconGridScene';
import {OrbitScene} from './OrbitScene';
import {SpotlightScene} from './SpotlightScene';
import {StepsScene} from './StepsScene';

export const FactScene: React.FC<{scene: TimedScene}> = ({scene}) => {
  const v = scene.visual;
  return (
    <>
      <Headline text={scene.headline} highlight={scene.highlight} />
      {v?.layout === 'bigNumber' ? <BigNumberScene visual={v} /> : null}
      {v?.layout === 'compare' ? <CompareScene visual={v} /> : null}
      {v?.layout === 'iconGrid' ? <IconGridScene visual={v} /> : null}
      {v?.layout === 'orbit' ? <OrbitScene visual={v} /> : null}
      {v?.layout === 'steps' ? <StepsScene visual={v} durationInFrames={scene.durationInFrames} /> : null}
      {v?.layout === 'spotlight' ? <SpotlightScene visual={v} /> : null}
    </>
  );
};
