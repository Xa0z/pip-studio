import {loadFont} from '@remotion/google-fonts/Fredoka';

const {fontFamily} = loadFont('normal', {weights: ['500', '600', '700'], subsets: ['latin']});

export const FONT = fontFamily;

export const COLORS = {
  bgTop: '#0B1030',
  bgBottom: '#3A1C6B',
  white: '#FFFFFF',
  orange: '#FF7A1A',
  yellow: '#FFD23F',
  cyan: '#3DF5FF',
  navy: '#1B1F3B',
  card: 'rgba(255,255,255,0.08)',
  cardBorder: 'rgba(255,255,255,0.16)',
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 1860;
