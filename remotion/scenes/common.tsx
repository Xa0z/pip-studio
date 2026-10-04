import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, FONT} from '../theme';

export const useIn = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping, mass: 0.6}});
};

/** Splits the headline and colors the highlight words orange. */
export const Highlighted: React.FC<{text: string; highlight: string[]}> = ({text, highlight}) => {
  if (!highlight.length) return <>{text}</>;
  const escaped = highlight.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        highlight.some((h) => h.toLowerCase() === p.toLowerCase()) ? (
          <span key={i} style={{color: COLORS.orange}}>
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
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
  const p = useIn(2);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 70,
        width,
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.08,
        color: COLORS.white,
        textShadow: '0 6px 24px rgba(0,0,0,0.35)',
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [40, 0])}px)`,
      }}
    >
      <Highlighted text={text} highlight={highlight} />
    </div>
  );
};

/** The area between the headline and the subtitles where the visual lives. */
export const Stage: React.FC<{children: React.ReactNode; top?: number; height?: number}> = ({children, top = 640, height = 560}) => (
  <div style={{position: 'absolute', top, left: 0, width: 1080, height, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
    {children}
  </div>
);

export const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div
    style={{
      background: COLORS.card,
      border: `3px solid ${COLORS.cardBorder}`,
      borderRadius: 44,
      boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const formatNumber = (v: number, decimals = 0) =>
  v.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
