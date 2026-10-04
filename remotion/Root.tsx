import React from 'react';
import {Composition} from 'remotion';
import {CharacterSheet} from './CharacterSheet';
import {PipPreview} from './PipPreview';
import {SAMPLE_PROPS} from './sample';
import {FPS, HEIGHT, TOTAL_FRAMES, WIDTH} from './theme';
import {Video} from './Video';
import type {VideoProps} from '../src/schema';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="PipVideo"
      component={Video}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={SAMPLE_PROPS}
      calculateMetadata={({props}: {props: VideoProps}) => ({durationInFrames: props.totalFrames ?? TOTAL_FRAMES})}
    />
    <Composition id="PipPreview" component={PipPreview} durationInFrames={FPS * 8} fps={FPS} width={WIDTH} height={HEIGHT} />
    {/* 30 frames so the worker can grab frame 12, after the idle bob has settled. */}
    <Composition id="CharacterSheet" component={CharacterSheet} durationInFrames={30} fps={FPS} width={1080} height={1080} defaultProps={{character: 'pip', title: 'Pip'}} />
  </>
);
