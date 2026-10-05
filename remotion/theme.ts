import {createContext, useContext} from 'react';
import {resolveTheme, type VideoTheme} from '../src/themes';
import {loadFont} from '@remotion/google-fonts/PlusJakartaSans';

const {fontFamily} = loadFont('normal', {weights: ['500', '600', '700', '800'], subsets: ['latin']});

export const FONT = fontFamily;

/** Colours come from the user's video theme (src/themes.ts); Video provides it, everything else reads it. */
export const ThemeContext = createContext<VideoTheme>(resolveTheme(null));
export const useTheme = () => useContext(ThemeContext);

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 1860;
