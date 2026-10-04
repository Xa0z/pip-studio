// Default props so the Studio can preview the video without running the pipeline.
import type {VideoProps} from '../src/schema';
import venus from '../fixtures/venus.json';

const scenes = (venus.scenes as VideoProps['scenes']).map((s, i, all) => {
  const each = Math.floor(1860 / all.length);
  return {...s, from: i * each, durationInFrames: i === all.length - 1 ? 1860 - i * each : each};
});

export const SAMPLE_PROPS: VideoProps = {episode: 1, title: 'Did you know? #1', scenes, words: [], voiceFile: null, musicFile: null};
