import React from 'react';
import type {TimedScene} from '../../src/schema';
import {Bars3D} from '../three/Bars3D';
import {Orbit3D} from '../three/Orbit3D';
import {Stack3D} from '../three/Stack3D';
import {useStyle} from '../theme';
import {BigNumberScene} from './BigNumberScene';
import {Headline} from './common';
import {CompareScene} from './CompareScene';
import {Spotlight3D, Steps3D} from './Depth';
import {IconGridScene} from './IconGridScene';
import {OrbitScene} from './OrbitScene';
import {SpotlightScene} from './SpotlightScene';
import {StepsScene} from './StepsScene';

/** Layouts that have a 3D version. */
export const HAS_3D = ['bigNumber', 'compare', 'orbit', 'spotlight', 'steps'] as const;

/**
 * Whether this fact scene is drawn in 3D: "deep" videos use 3D wherever it exists,
 * "mixed" ones alternate, so 2D and 3D scenes take turns.
 */
export const in3D = (depth: string, layout: string | undefined, factIndex: number) =>
  !!layout && (HAS_3D as readonly string[]).includes(layout) && (depth === 'deep' || (depth === 'mixed' && factIndex % 2 === 0));

export const FactScene: React.FC<{scene: TimedScene; factIndex?: number}> = ({scene, factIndex = 0}) => {
  const style = useStyle();
  const v = scene.visual;
  const deep = in3D(style.depth, v?.layout, factIndex);
  return (
    <>
      <Headline text={scene.headline} highlight={scene.highlight} />
      {v?.layout === 'bigNumber' ? deep ? <Stack3D visual={v} /> : <BigNumberScene visual={v} /> : null}
      {v?.layout === 'compare' ? deep ? <Bars3D visual={v} /> : <CompareScene visual={v} /> : null}
      {v?.layout === 'iconGrid' ? <IconGridScene visual={v} /> : null}
      {v?.layout === 'orbit' ? deep ? <Orbit3D visual={v} /> : <OrbitScene visual={v} /> : null}
      {v?.layout === 'steps' ? deep ? <Steps3D visual={v} durationInFrames={scene.durationInFrames} /> : <StepsScene visual={v} durationInFrames={scene.durationInFrames} /> : null}
      {v?.layout === 'spotlight' ? deep ? <Spotlight3D visual={v} /> : <SpotlightScene visual={v} /> : null}
    </>
  );
};
