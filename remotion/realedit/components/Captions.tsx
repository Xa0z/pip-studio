import {Caption, createTikTokStyleCaptions} from '@remotion/captions';
import {loadFont} from '@remotion/google-fonts/Montserrat';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {CaptionWord} from '../types';

const {fontFamily} = loadFont('normal', {weights: ['700', '800'], subsets: ['latin']});

/**
 * Word-by-word captions, a few words at a time. Each word pops in with a short spring as it is spoken.
 * Kept in the TikTok safe area: left-aligned, above the bottom 20%, and well clear of the right-side buttons.
 */
export const Captions: React.FC<{words: CaptionWord[]}> = ({words}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pages = useMemo(() => {
    const captions: Caption[] = words.map((w, i) => ({text: (i ? ' ' : '') + w.text, startMs: w.start * 1000, endMs: w.end * 1000, timestampMs: ((w.start + w.end) / 2) * 1000, confidence: 1}));
    return createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds: 850, breakOnSilenceAfterMilliseconds: 450}).pages;
  }, [words]);
  const ms = (frame / fps) * 1000;
  const page = pages.find((p, i) => ms >= p.startMs && ms < Math.min(p.startMs + p.durationMs + 250, pages[i + 1]?.startMs ?? Infinity));
  if (!page) return null;
  const lastEnd = page.tokens[page.tokens.length - 1].toMs;
  const fadeOut = interpolate(ms, [lastEnd + 100, lastEnd + 250], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: 84, top: 1130, width: 790, fontFamily, fontWeight: 800, fontSize: 72, lineHeight: 1.12, color: '#FFFFFF', letterSpacing: -0.5, textShadow: '0 2px 3px rgba(0,0,0,0.55), 0 4px 18px rgba(0,0,0,0.35)', opacity: fadeOut}}>
        {page.tokens.map((t, i) => {
          if (ms < t.fromMs) return null;
          const s = spring({frame: frame - Math.round((t.fromMs / 1000) * fps), fps, config: {damping: 18, stiffness: 260, mass: 0.6}, durationInFrames: 8});
          return (
            <span key={i} style={{display: 'inline-block', whiteSpace: 'pre', transform: `translateY(${(1 - s) * 10}px) scale(${0.94 + 0.06 * s})`, opacity: Math.min(1, 0.2 + s)}}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
