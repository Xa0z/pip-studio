import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {luminance} from '../../src/themes';
import {push} from '../motion';
import {useStyle, useTheme} from '../theme';

type P = [number, number];
// Where the four backdrop shapes sit for each scene. They glide to the next set on every cut,
// so the background moves with the edit instead of sitting still. Kept to the edges, away from text.
const LAYOUTS: {circle: P; square: P; ring: P; dots: P}[] = [
  {circle: [-180, 1180], square: [800, 120], ring: [860, 1500], dots: [90, 120]},
  {circle: [700, 1240], square: [-120, 520], ring: [80, 1560], dots: [860, 560]},
  {circle: [-220, 380], square: [820, 1460], ring: [880, 300], dots: [110, 1600]},
  {circle: [660, -160], square: [-90, 1360], ring: [120, 300], dots: [860, 1240]},
];

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Backdrop behind every scene. Its look comes from the video style. */
export const Background: React.FC<{sceneIndex?: number; sceneFrom?: number}> = (props) => {
  const style = useStyle();
  if (style.backdrop === 'shapes') return <ShapesBackdrop {...props} />;
  if (style.backdrop === 'grid') return <GridBackdrop {...props} />;
  if (style.backdrop === 'bands') return <BandsBackdrop {...props} />;
  if (style.backdrop === 'dots') return <DotsBackdrop {...props} />;
  return <GlowBackdrop {...props} />;
};

/** 0 -> 1 as the backdrop moves into this scene's arrangement. */
const useCut = (sceneIndex: number, sceneFrom: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return sceneIndex === 0 ? 1 : push(frame, fps, sceneFrom - 4);
};

/** Crisp flat shapes (circle, square, ring, triangle) at the edges that glide to new spots on every cut. */
const ShapesBackdrop: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const t = useCut(sceneIndex, sceneFrom);
  const from = LAYOUTS[Math.max(0, sceneIndex - 1) % LAYOUTS.length];
  const to = LAYOUTS[sceneIndex % LAYOUTS.length];
  const at = (key: keyof (typeof LAYOUTS)[number], k: number) => {
    const p = lerp(from[key], to[key], t);
    return {left: p[0] + Math.sin(frame / 60 + k) * 14, top: p[1] + Math.cos(frame / 75 + k) * 16};
  };
  const spin = frame / 4 + sceneIndex * 35;
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      <div style={{position: 'absolute', ...at('circle', 0), width: 420, height: 420, borderRadius: 210, background: th.accentSoft, opacity: 0.35}} />
      <div style={{position: 'absolute', ...at('square', 1.3), width: 260, height: 260, borderRadius: 36, background: th.marker, opacity: 0.6, rotate: `${spin}deg`}} />
      <div style={{position: 'absolute', ...at('ring', 2.2), width: 300, height: 300, borderRadius: 150, border: `26px solid ${th.accent2}`, opacity: 0.22}} />
      <svg width={180} height={160} style={{position: 'absolute', ...at('dots', 3.1), opacity: 0.3, rotate: `${-spin * 0.6}deg`}}>
        <polygon points="90,6 174,154 6,154" fill={th.accent} />
      </svg>
    </AbsoluteFill>
  );
};

/** Graph paper that slowly slides, shifting a little further on each cut. */
const GridBackdrop: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const t = useCut(sceneIndex, sceneFrom);
  const cell = 90;
  const shift = (Math.max(0, sceneIndex - 1) + t) * 45 + frame * 0.4;
  const row = (k: number) => 260 + ((k * 7) % 4) * 380;
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      <svg width={1080 + cell * 2} height={1920 + cell * 2} style={{position: 'absolute', left: -cell + (shift % cell), top: -cell + ((shift * 0.6) % cell)}}>
        <defs>
          <pattern id="pip-grid" width={cell} height={cell} patternUnits="userSpaceOnUse">
            <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke={th.line} strokeWidth={2} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pip-grid)" />
      </svg>
      {/* A thick ruler line that moves to a new row on every cut. */}
      <div style={{position: 'absolute', left: 0, right: 0, top: row(Math.max(0, sceneIndex - 1)) + (row(sceneIndex) - row(Math.max(0, sceneIndex - 1))) * t, height: 6, background: th.accentSoft, opacity: 0.6}} />
    </AbsoluteFill>
  );
};

/** Two wide flat diagonal bands that swing to a new angle on each cut. */
const BandsBackdrop: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const t = useCut(sceneIndex, sceneFrom);
  const angle = (k: number) => -18 + (k % 3) * 14;
  const a = angle(Math.max(0, sceneIndex - 1)) + (angle(sceneIndex) - angle(Math.max(0, sceneIndex - 1))) * t;
  const y = (k: number) => [1500, 1250, 1650][k % 3];
  const top = y(Math.max(0, sceneIndex - 1)) + (y(sceneIndex) - y(Math.max(0, sceneIndex - 1))) * t + Math.sin(frame / 50) * 10;
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: -400, right: -400, top, height: 520, background: th.marker, opacity: 0.55, rotate: `${a}deg`}} />
      <div style={{position: 'absolute', left: -400, right: -400, top: top - 1500, height: 160, background: th.accentSoft, opacity: 0.35, rotate: `${a}deg`}} />
    </AbsoluteFill>
  );
};

/** A calm dot grid with a few dots in the accent colour that hop on each cut. */
const DotsBackdrop: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const t = useCut(sceneIndex, sceneFrom);
  const gap = 72;
  const drift = frame * 0.3;
  const picks = [0, 1, 2, 3, 4].map((k) => ({c: (sceneIndex * 5 + k * 7) % 15, r: (sceneIndex * 3 + k * 11) % 27}));
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      <svg width={1080 + gap} height={1920 + gap} style={{position: 'absolute', left: -(drift % gap), top: -((drift * 0.5) % gap)}}>
        <defs>
          <pattern id="pip-dots" width={gap} height={gap} patternUnits="userSpaceOnUse">
            <circle cx={gap / 2} cy={gap / 2} r={4} fill={th.line} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pip-dots)" />
        {picks.map((p, k) => (
          <circle key={k} cx={p.c * gap + gap / 2} cy={p.r * gap + gap / 2} r={14 * t} fill={k % 2 ? th.accentSoft : th.accent2} opacity={0.6} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** Backdrop: soft blurred light in the theme colours that drifts and moves to a new spot on every cut. */
const GlowBackdrop: React.FC<{sceneIndex?: number; sceneFrom?: number}> = ({sceneIndex = 0, sceneFrom = 0}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const from = LAYOUTS[Math.max(0, sceneIndex - 1) % LAYOUTS.length];
  const to = LAYOUTS[sceneIndex % LAYOUTS.length];
  const t = sceneIndex === 0 ? 1 : push(frame, fps, sceneFrom - 4);
  const drift = (k: number): P => [Math.sin(frame / 70 + k) * 18, Math.cos(frame / 85 + k) * 22];
  const at = (key: keyof (typeof LAYOUTS)[number], k: number) => {
    const p = lerp(from[key], to[key], t);
    const d = drift(k);
    return {left: p[0] + d[0], top: p[1] + d[1]};
  };
  const dark = luminance(th.bg) < 0.18;
  const blob = (key: keyof (typeof LAYOUTS)[number], k: number, size: number, color: string, opacity: number) => {
    const p = at(key, k);
    return <div style={{position: 'absolute', left: p.left - size / 4, top: p.top - size / 4, width: size, height: size, borderRadius: size / 2, background: color, opacity, filter: 'blur(130px)'}} />;
  };
  return (
    <AbsoluteFill style={{background: th.bg, overflow: 'hidden'}}>
      {/* Soft ambient light in the theme colours, drifting and re-framing on every cut. */}
      {blob('circle', 0, 760, th.accent, dark ? 0.45 : 0.28)}
      {blob('square', 1.7, 620, th.accentSoft, dark ? 0.3 : 0.55)}
      {blob('ring', 3.1, 520, th.accent2, dark ? 0.35 : 0.22)}
    </AbsoluteFill>
  );
};
