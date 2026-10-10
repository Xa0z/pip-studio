import React from 'react';
import {AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame} from 'remotion';
import type {VideoProps} from '../../src/schema';
import {Subtitles} from '../components/Subtitles';
import {TOTAL_FRAMES} from '../theme';
import {KitContext, type Beat} from './kit';

/**
 * A video drawn by an episode Claude wrote for this one video. The host keeps what must never
 * change or break: the user's background colour, the voice, music and the spoken-word captions.
 * Theme and style contexts are provided by Video, which renders this.
 */
export const DirectorVideo: React.FC<VideoProps & {Episode: React.FC}> = ({Episode, scenes, words, voiceFile, musicFile, totalFrames = TOTAL_FRAMES, character = 'pip', theme}) => {
  const frame = useCurrentFrame();
  return (
    <KitContext.Provider value={{beats: scenes as Beat[], words, frame, character}}>
      <AbsoluteFill style={{backgroundColor: theme?.bg}}>
        <Episode />
        <Subtitles words={words} />
        {voiceFile ? <Audio src={staticFile(voiceFile)} /> : null}
        {musicFile ? (
          <Audio
            src={staticFile(musicFile)}
            loop
            volume={(f) => 0.1 * interpolate(f, [0, 15, totalFrames - 45, totalFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
          />
        ) : null}
      </AbsoluteFill>
    </KitContext.Provider>
  );
};
