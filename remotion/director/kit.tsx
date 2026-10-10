/**
 * The building blocks a Claude-written episode may import (as '../kit').
 * Everything that has to stay the same from video to video lives here: the user's colours,
 * the channel's character, the font, the icons and the free library photos. The episode code
 * decides everything else (layout, motion, 2D or 3D, pacing).
 */
import React, {createContext, useContext} from 'react';
import {Img, Loop, OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import type {IconName, Scene, Visual, Word} from '../../src/schema';
import type {VideoTheme} from '../../src/themes';
import {CHARACTERS} from '../character/registry';
import type {PipExpression, PipPose} from '../character/Pip';
import {Icon as DrawnIcon} from '../components/Icons';
import {isTalking} from '../components/Subtitles';
import {Highlighted as HighlightedText, KineticText as Kinetic} from '../scenes/common';
import {FONT as BRAND_FONT, useTheme as useThemeColours} from '../theme';

/** One spoken part of the video, already timed to the voice (frames are absolute, 30 fps). */
export type Beat = Scene & {from: number; durationInFrames: number; idea?: string; icon?: IconName};

export type KitData = {
  beats: Beat[];
  words: Word[];
  /** Absolute frame of the whole video (set by the host on every frame). */
  frame: number;
  /** Key in remotion/character/registry.tsx, or null when the channel has no character. */
  character: string | null;
};

export const KitContext = createContext<KitData>({beats: [], words: [], frame: 0, character: null});

/** The user's colours. Use these for every colour in the video (plus white/black mixes of them). */
export const useTheme = (): VideoTheme => useThemeColours();

/** The channel font (Plus Jakarta Sans, weights 500 to 800). */
export const FONT = BRAND_FONT;

/** All beats with their timing; beat i plays from beats[i].from for beats[i].durationInFrames frames. */
export const useBeats = (): Beat[] => useContext(KitContext).beats;

/** Every spoken word with start and end in seconds from the start of the video. */
export const useWords = (): Word[] => useContext(KitContext).words;

/** True when the channel has a character to show. */
export const useHasCharacter = (): boolean => {
  const c = useContext(KitContext).character;
  return !!c && !!CHARACTERS[c];
};

/**
 * The channel's character (Pip or the user's own). Always looks the same; you choose where it
 * stands, how big it is and how it moves (wrap it in a positioned div). Its mouth moves by itself
 * while the voice speaks. Draws nothing when the channel has no character.
 */
export const Character: React.FC<{expression?: PipExpression; pose?: PipPose; width?: number}> = ({expression = 'happy', pose = 'idle', width = 360}) => {
  const k = useContext(KitContext);
  const {fps} = useVideoConfig();
  const C = k.character ? CHARACTERS[k.character] : undefined;
  if (!C) return null;
  return (
    <div style={{width}}>
      <C expression={expression} pose={pose} talking={isTalking(k.words, k.frame / fps)} />
    </div>
  );
};

/** A flat, code-drawn icon (names: see ICONS). */
export const Icon: React.FC<{name: IconName; size: number; style?: React.CSSProperties}> = ({name, size, style}) => <DrawnIcon name={name} size={size} style={style} />;

/** Words that sharpen in one after another; highlight words get the marker colour band. */
export const KineticText: React.FC<{text: string; highlight?: string[]; delay?: number; stagger?: number}> = ({text, highlight = [], delay = 0, stagger = 3}) => (
  <Kinetic text={text} highlight={highlight} delay={delay} stagger={stagger} />
);

/** Static text with the highlight words in the accent colour on the marker band. */
export const Highlighted: React.FC<{text: string; highlight?: string[]}> = ({text, highlight = []}) => <HighlightedText text={text} highlight={highlight} />;

/**
 * The real photo or clip found for beat `beat` (only beats whose plan asked for "media"), filling
 * its box (object-fit cover). When none was found it shows the beat's icon instead, so always
 * design the frame so either looks fine.
 */
export const Media: React.FC<{beat: number; width: number; height: number; style?: React.CSSProperties}> = ({beat, width, height, style}) => {
  const k = useContext(KitContext);
  const th = useThemeColours();
  const {fps} = useVideoConfig();
  const b = k.beats[beat];
  const v: Visual | undefined = b?.visual;
  const box: React.CSSProperties = {width, height, overflow: 'hidden', position: 'relative', background: th.surface, ...style};
  if (v?.layout === 'media' && v.src) {
    const fill: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
    return (
      <div style={box}>
        {v.kind === 'clip' ? (
          <Loop durationInFrames={Math.max(1, Math.floor((v.seconds ?? 10) * fps))}>
            <OffthreadVideo src={staticFile(v.src)} muted style={fill} />
          </Loop>
        ) : (
          <Img src={staticFile(v.src)} style={fill} />
        )}
      </div>
    );
  }
  const icon = (v && 'icon' in v ? v.icon : undefined) ?? b?.icon ?? 'lightbulb';
  return (
    <div style={{...box, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <DrawnIcon name={icon} size={Math.min(width, height) * 0.6} />
    </div>
  );
};

/** Video size and the band where the host draws the spoken-word captions (keep key text out of it). */
export const CANVAS = {width: 1080, height: 1920, fps: 30, captionTop: 1300, captionBottom: 1520} as const;
