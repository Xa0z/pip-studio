import React, {useMemo} from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Word} from '../../src/schema';
import {FONT, useTheme} from '../theme';

type Group = {words: Word[]; start: number; end: number};

/** Max 3 words on screen; breaks early at punctuation or pauses. */
export const groupWords = (words: Word[]): Group[] => {
  const groups: Group[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) groups.push({words: cur, start: cur[0].start, end: cur[cur.length - 1].end});
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && (cur.length >= 3 || /[.!?,;:]$/.test(prev.text) || w.start - prev.end > 0.35)) flush();
    cur.push(w);
  });
  flush();
  return groups;
};

export const Subtitles: React.FC<{words: Word[]; top?: number}> = ({words, top = 1330}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const groups = useMemo(() => groupWords(words), [words]);
  const gi = groups.findIndex((g, i) => t >= g.start - 0.05 && t < (groups[i + 1]?.start ?? g.end + 0.6) && t < g.end + 0.6);
  if (gi < 0) return null;
  const g = groups[gi];
  const since = t - g.start;
  const pop = Math.min(1, 0.85 + since * 1.5);
  return (
    <div style={{position: 'absolute', top, left: 40, width: 1000, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', columnGap: 34, transform: `scale(${pop})`}}>
      {g.words.map((w, i) => {
        const active = t >= w.start - 0.03 && (t < (g.words[i + 1]?.start ?? Infinity));
        // Each word gets a small spring "hit" the moment it is spoken.
        const hit = spring({frame: frame - Math.round((w.start - 0.03) * fps), fps, config: {damping: 10, mass: 0.4, stiffness: 220}});
        const lift = active ? 1 + 0.1 * (1 - hit) + 0.04 : 1;
        return (
          <span
            key={i}
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 80,
              letterSpacing: -0.5,
              color: active ? th.onAccent : th.ink,
              background: active ? th.accent : 'transparent',
              borderRadius: 14,
              padding: '0 14px',
              margin: '0 -14px',
              display: 'inline-block',
              scale: `${lift}`,
              rotate: active ? `${(1 - hit) * -3}deg` : '0deg',
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

export const isTalking = (words: Word[], t: number) => words.some((w) => t >= w.start - 0.03 && t <= w.end + 0.05);
