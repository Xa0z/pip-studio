import {loadFont} from '@remotion/google-fonts/PlusJakartaSans';

const {fontFamily} = loadFont('normal', {weights: ['500', '600', '700', '800'], subsets: ['latin']});

export const FONT = fontFamily;

/** Sage theme, same as the website: flat stone background, porcelain panels, charcoal text, sage accents. */
export const COLORS = {
  bg: '#EBE5DF',
  surface: '#F7F6F2',
  track: '#DCD5CC',
  line: '#CFC8BE',
  ink: '#24272A',
  inkMuted: '#5B6B68',
  sage: '#465B53',
  sage2: '#73847C',
  mint: '#A7B8A9',
  marker: '#C5D3C7',
  onSage: '#F7F6F2',
  orange: '#D9622B',
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 1860;
