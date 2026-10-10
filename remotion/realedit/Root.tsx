import React from 'react';
import {Composition} from 'remotion';
import {RealEdit} from './RealEdit';
import type {RealEditProps} from './types';

const EMPTY: RealEditProps = {shots: [], words: [], speech: [], voiceFile: null, musicFile: null, musicStart: 0, sfx: [], graded: false, grainFile: null, totalFrames: 600};

/** Real-footage videos. Separate from the Pip animated videos (remotion/index.ts), so those keep working as before. */
export const RealEditRoot: React.FC = () => (
  <Composition
    id="RealEdit"
    component={RealEdit}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={600}
    defaultProps={EMPTY}
    calculateMetadata={({props}: {props: RealEditProps}) => ({durationInFrames: props.totalFrames})}
  />
);
