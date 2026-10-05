import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {prog} from '../motion';
import {FONT, useTheme} from '../theme';

export const useIn = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping, mass: 0.6}});
};

type Token = {text: string; hi: boolean};

/** Splits text into words and marks the ones that belong to a highlight phrase. */
export const tokenize = (text: string, highlight: string[]): Token[] => {
  const escaped = highlight.filter(Boolean).map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = escaped.length ? text.split(new RegExp(`(${escaped.join('|')})`, 'gi')) : [text];
  const out: Token[] = [];
  for (const p of parts) {
    const hi = highlight.some((h) => h.toLowerCase() === p.toLowerCase());
    for (const w of p.split(/\s+/).filter(Boolean)) out.push({text: w, hi});
  }
  return out;
};

/** Accent text with a marker band drawn behind it, `p` 0..1 from left to right. */
export const markerStyle = (accent: string, marker: string, p: number): React.CSSProperties => ({
  color: accent,
  backgroundImage: `linear-gradient(${marker}, ${marker})`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: '0 88%',
  backgroundSize: `${p * 100}% 36%`,
  padding: '0 6px',
  margin: '0 -6px',
});

/**
 * Kinetic headline: each word sharpens out of a blur one after another, then the highlight
 * words get a marker stroke drawn left to right, like an editor's title card.
 */
export const KineticText: React.FC<{text: string; highlight: string[]; delay?: number; stagger?: number}> = ({text, highlight, delay = 0, stagger = 3}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tokens = tokenize(text, highlight);
  const markerStart = delay + tokens.length * stagger + 4;
  let hiSeen = 0;
  return (
    <>
      {tokens.map((tk, i) => {
        const rise = spring({frame: frame - delay - i * stagger, fps, config: {damping: 18, mass: 0.6, stiffness: 120}});
        const mark = tk.hi ? prog(frame, markerStart + hiSeen++ * 4, 12) : 0;
        // Alternate words start a little higher or lower, so the line "settles" together.
        const off = i % 3 === 1 ? -0.5 : 1;
        return (
          <React.Fragment key={i}>
            <span style={{display: 'inline-block'}}>
              <span
                style={{
                  display: 'inline-block',
                  opacity: Math.min(1, rise * 1.4),
                  filter: rise < 0.98 ? `blur(${(1 - rise) * 16}px)` : undefined,
                  translate: `0 ${(1 - rise) * 0.6 * off}em`,
                  scale: `${1 + (1 - rise) * 0.15}`,
                  ...(tk.hi ? markerStyle(th.accent, th.marker, mark) : null),
                }}
              >
                {tk.text}
              </span>
            </span>
            {i < tokens.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Static version (kept for places that should not animate). */
export const Highlighted: React.FC<{text: string; highlight: string[]}> = ({text, highlight}) => {
  const th = useTheme();
  return (
    <>
      {tokenize(text, highlight).map((tk, i, all) => (
        <React.Fragment key={i}>
          {tk.hi ? (
            <span style={{color: th.accent, background: `linear-gradient(transparent 58%, ${th.marker} 58%, ${th.marker} 92%, transparent 92%)`, padding: '0 6px', margin: '0 -6px'}}>{tk.text}</span>
          ) : (
            tk.text
          )}
          {i < all.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </>
  );
};

export const Headline: React.FC<{text: string; highlight: string[]; size?: number; top?: number; width?: number}> = ({
  text,
  highlight,
  size = 74,
  top = 340,
  width = 760,
}) => {
  const th = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 70,
        width,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.1,
        letterSpacing: -1,
        color: th.ink,
      }}
    >
      <KineticText text={text} highlight={highlight} delay={2} />
    </div>
  );
};

/** The area between the headline and the subtitles where the visual lives. */
export const Stage: React.FC<{children: React.ReactNode; top?: number; height?: number}> = ({children, top = 640, height = 560}) => (
  <div style={{position: 'absolute', top, left: 0, width: 1080, height, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
    {children}
  </div>
);

export const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => {
  const th = useTheme();
  return (
    <div
      style={{
        background: th.surface,
        border: `3px solid ${th.line}`,
        borderRadius: 28,
        boxShadow: `0 10px 0 ${th.track}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A few flat dots that fly out from a point once, e.g. when a number lands. */
export const Burst: React.FC<{at: number; x: number; y: number; radius?: number; count?: number}> = ({at, x, y, radius = 220, count = 10}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const p = prog(frame, at, 22);
  if (frame < at || p >= 1) return null;
  const colors = [th.accent, th.accentSoft, th.accent2];
  return (
    <>
      {new Array(count).fill(0).map((_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.3;
        const r = radius * p;
        const s = (i % 3 === 0 ? 22 : 14) * (1 - p * 0.7);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + Math.cos(a) * r - s / 2,
              top: y + Math.sin(a) * r - s / 2,
              width: s,
              height: s,
              borderRadius: i % 2 ? s / 2 : 4,
              rotate: `${p * 180}deg`,
              background: colors[i % 3],
              opacity: 1 - p,
            }}
          />
        );
      })}
    </>
  );
};

export const formatNumber = (v: number, decimals = 0) =>
  v.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});

/** Characters typed per frame, and when typing of `text` (starting at `start`) is done. */
export const TYPE_SPEED = 1.1;
export const typedEnd = (text: string, start: number) => start + Math.ceil(text.length / TYPE_SPEED);

/**
 * Text that types itself out with a blinking caret, like someone searching.
 * Highlight words turn accent as they are typed; their marker draws from `markAt`.
 */
export const TypeText: React.FC<{text: string; highlight: string[]; start: number; markAt?: number; caret?: boolean}> = ({text, highlight, start, markAt = 100000, caret = true}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.floor((frame - start) * TYPE_SPEED));
  const done = n >= text.length;
  const tokens = tokenize(text, highlight);
  let used = 0;
  let hiSeen = 0;
  const blinkOn = !done || Math.floor(frame / 12) % 2 === 0;
  return (
    <>
      {tokens.map((tk, i) => {
        const begin = used;
        used += tk.text.length + 1;
        const shown = tk.text.slice(0, Math.max(0, n - begin));
        if (!shown) return null;
        const mark = tk.hi ? prog(frame, markAt + hiSeen++ * 4, 12) : 0;
        return (
          <React.Fragment key={i}>
            <span style={tk.hi ? markerStyle(th.accent, th.marker, mark) : undefined}>{shown}</span>
            {i < tokens.length - 1 && n > begin + tk.text.length ? ' ' : null}
          </React.Fragment>
        );
      })}
      {caret && frame < markAt + 30 ? <span style={{display: 'inline-block', width: '0.07em', height: '0.95em', marginLeft: '0.06em', verticalAlign: '-0.12em', background: th.accent, opacity: blinkOn ? 1 : 0}} /> : null}
    </>
  );
};
