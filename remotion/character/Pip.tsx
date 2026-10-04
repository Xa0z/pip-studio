/**
 * PIP: the one and only Pip. Every video imports this component.
 *
 * Do not redraw, restyle, or change colors, shapes or proportions here.
 * Props only control animation. Size and position come from the parent:
 * Pip fills the width of its container and keeps its own aspect ratio.
 */
import React, {useId} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export type PipExpression = 'happy' | 'surprised' | 'thinking' | 'excited' | 'wink';
export type PipPose = 'idle' | 'pointing' | 'waving' | 'jumping';

export type PipProps = {
  expression?: PipExpression;
  pose?: PipPose;
  talking?: boolean;
};

// ---- Brand constants (locked) ----
const BODY = '#FF7A1A';
const SCREEN = '#1B1F3B';
const EYE = '#3DF5FF';
const LIGHT = '#FFD23F';

// ---- Geometry (locked), in a 400 x 480 box ----
const VIEW_W = 400;
const VIEW_H = 480;
const CX = 200;
const BODY_CY = 285;
const BODY_R = 140;
const SCREEN_X = 92;
const SCREEN_Y = 200;
const SCREEN_W = 216;
const SCREEN_H = 150;
const EYE_L = {x: 152, y: 262};
const EYE_R = {x: 248, y: 262};
const EYE_RX = 25;
const EYE_RY = 31;
const MOUTH_Y = 318;
const SHOULDER_L = {x: 84, y: 300};
const SHOULDER_R = {x: 316, y: 300};
const ARM_LEN = 58;
const ARM_REST = 32; // degrees outward when relaxed
const HAND_R = 27;
const ANTENNA_BASE_Y = 150;
const ANTENNA_TOP_Y = 92;
const BALL_R = 17;

const starPath = (x: number, y: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`);
  }
  return `M${pts.join('L')}Z`;
};

const Arm: React.FC<{side: 'left' | 'right'; angle: number}> = ({side, angle}) => {
  const s = side === 'left' ? SHOULDER_L : SHOULDER_R;
  const dir = side === 'left' ? -1 : 1;
  // Arm hangs down at angle 0; a positive angle lifts it outward and up.
  return (
    <g transform={`rotate(${-dir * angle} ${s.x} ${s.y})`}>
      <rect x={s.x - 13 + dir * 4} y={s.y - 4} width={26} height={ARM_LEN} rx={13} fill={BODY} />
      <circle cx={s.x + dir * 4} cy={s.y + ARM_LEN} r={HAND_R} fill={BODY} />
      <circle cx={s.x + dir * 4} cy={s.y + ARM_LEN} r={HAND_R} fill="#000" opacity={0.1} />
      <circle cx={s.x + dir * 4 - 7} cy={s.y + ARM_LEN - 8} r={7} fill="#fff" opacity={0.25} />
    </g>
  );
};

export const Pip: React.FC<PipProps> = ({expression = 'happy', pose = 'idle', talking = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glowId = `pip-glow-${uid}`;
  const lightId = `pip-light-${uid}`;
  const clipId = `pip-clip-${uid}`;

  // Gentle float, always on.
  const float = Math.sin(t * Math.PI * 0.9) * 9;

  // Jump: hop every 0.9 s with squash on landing.
  let hop = 0;
  let squashX = 1;
  let squashY = 1;
  if (pose === 'jumping') {
    const cycle = (t % 0.9) / 0.9;
    hop = -Math.sin(cycle * Math.PI) * 70;
    const land = cycle < 0.12 ? 1 - cycle / 0.12 : cycle > 0.92 ? (cycle - 0.92) / 0.08 : 0;
    squashX = 1 + land * 0.08;
    squashY = 1 - land * 0.08;
  }

  // Arms
  let leftAngle = ARM_REST + Math.sin(t * 2) * 5;
  let rightAngle = ARM_REST + Math.sin(t * 2 + 1) * 5;
  if (pose === 'pointing') {
    rightAngle = 115 + Math.sin(t * 3) * 3;
  } else if (pose === 'waving') {
    leftAngle = 140 + Math.sin(t * 9) * 22;
  } else if (pose === 'jumping') {
    leftAngle = 150 + Math.sin(t * 7) * 8;
    rightAngle = 150 + Math.sin(t * 7 + 1) * 8;
  }

  // Blink every ~3.4 s (not for star eyes or wink's closed eye).
  const blinkPhase = (t % 3.4) / 3.4;
  const blink = blinkPhase > 0.96 ? 0.12 : 1;

  // Antenna light: soft pulse with a bright blink.
  const lightPulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.6));
  const flash = (t % 2) < 0.12 ? 1 : 0;
  const lightGlow = Math.min(1, lightPulse + flash * 0.5);

  // Talking: screen and mouth pulse.
  const talkWave = talking ? 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * 4.2)) : 0;
  const screenPulse = talking ? 0.05 + talkWave * 0.1 : 0.03;
  const eyeGlow = talking ? 9 + talkWave * 8 : 9;

  // Eye look direction
  const look = expression === 'thinking' ? {x: 8, y: -9} : {x: 0, y: 0};

  const eyeOval = (e: {x: number; y: number}, scale = 1, key?: string) => (
    <g key={key}>
      <ellipse cx={e.x + look.x} cy={e.y + look.y} rx={EYE_RX * scale} ry={EYE_RY * scale * blink} fill={EYE} />
      {blink > 0.5 ? (
        <circle cx={e.x + look.x - 8 * scale} cy={e.y + look.y - 11 * scale} r={7 * scale} fill="#fff" opacity={0.85} />
      ) : null}
    </g>
  );

  const happyArc = (e: {x: number; y: number}, key?: string) => (
    <path
      key={key}
      d={`M${e.x - 24},${e.y + 8} Q${e.x},${e.y - 30} ${e.x + 24},${e.y + 8}`}
      stroke={EYE}
      strokeWidth={13}
      strokeLinecap="round"
      fill="none"
    />
  );

  let eyes: React.ReactNode;
  if (expression === 'happy') {
    eyes = [eyeOval(EYE_L, 1, 'l'), eyeOval(EYE_R, 1, 'r')];
  } else if (expression === 'surprised') {
    eyes = [eyeOval(EYE_L, 1.22, 'l'), eyeOval(EYE_R, 1.22, 'r')];
  } else if (expression === 'thinking') {
    eyes = [
      eyeOval(EYE_L, 1, 'l'),
      <g key="r">
        <ellipse cx={EYE_R.x + look.x} cy={EYE_R.y + look.y + 4} rx={EYE_RX} ry={EYE_RY * 0.45 * blink} fill={EYE} />
      </g>,
    ];
  } else if (expression === 'excited') {
    const spin = Math.sin(t * 5) * 8;
    eyes = [EYE_L, EYE_R].map((e, i) => (
      <path key={i} d={starPath(e.x, e.y, 33)} fill={EYE} transform={`rotate(${spin} ${e.x} ${e.y})`} />
    ));
  } else {
    // wink
    eyes = [eyeOval(EYE_L, 1, 'l'), happyArc(EYE_R, 'r')];
  }

  // Mouth
  let mouth: React.ReactNode;
  const open = talkWave; // 0..1
  if (talking && expression !== 'surprised') {
    const h = 6 + open * 20;
    mouth = <rect x={CX - 20} y={MOUTH_Y - h / 2} width={40} height={h} rx={Math.min(10, h / 2)} fill={EYE} />;
  } else if (expression === 'surprised') {
    const r = 11 + open * 5;
    mouth = <ellipse cx={CX} cy={MOUTH_Y} rx={r * 0.85} ry={r} fill="none" stroke={EYE} strokeWidth={7} />;
  } else if (expression === 'excited') {
    mouth = <path d={`M${CX - 30},${MOUTH_Y - 8} Q${CX},${MOUTH_Y + 34} ${CX + 30},${MOUTH_Y - 8} Z`} fill={EYE} />;
  } else if (expression === 'thinking') {
    mouth = <path d={`M${CX - 16},${MOUTH_Y + 4} L${CX + 18},${MOUTH_Y - 3}`} stroke={EYE} strokeWidth={7} strokeLinecap="round" />;
  } else {
    mouth = (
      <path d={`M${CX - 24},${MOUTH_Y - 6} Q${CX},${MOUTH_Y + 16} ${CX + 24},${MOUTH_Y - 6}`} stroke={EYE} strokeWidth={7} strokeLinecap="round" fill="none" />
    );
  }

  const bodyTilt = pose === 'pointing' ? 4 : pose === 'waving' ? -3 : 0;
  const shadowScale = interpolate(hop + float, [-80, 10], [0.6, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{width: '100%', height: 'auto', overflow: 'visible', display: 'block'}}>
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={eyeGlow} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={lightId} x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation={10 * lightGlow} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={clipId}>
          <circle cx={CX} cy={BODY_CY} r={BODY_R} />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse cx={CX} cy={VIEW_H - 14} rx={110 * shadowScale} ry={14 * shadowScale} fill="#000" opacity={0.28} />

      <g transform={`translate(0 ${float + hop})`}>
        <g transform={`translate(${CX} ${BODY_CY + BODY_R}) scale(${squashX} ${squashY}) rotate(${bodyTilt}) translate(${-CX} ${-(BODY_CY + BODY_R)})`}>
          {/* arms behind body */}
          <Arm side="left" angle={leftAngle} />
          <Arm side="right" angle={rightAngle} />

          {/* antenna */}
          <rect x={CX - 7} y={ANTENNA_TOP_Y} width={14} height={ANTENNA_BASE_Y - ANTENNA_TOP_Y + 10} rx={7} fill={BODY} />
          <rect x={CX - 7} y={ANTENNA_TOP_Y} width={14} height={ANTENNA_BASE_Y - ANTENNA_TOP_Y + 10} rx={7} fill="#000" opacity={0.18} />
          <ellipse cx={CX} cy={ANTENNA_BASE_Y + 2} rx={22} ry={9} fill={BODY} />
          <circle cx={CX} cy={ANTENNA_TOP_Y} r={BALL_R} fill={LIGHT} filter={`url(#${lightId})`} opacity={0.75 + 0.25 * lightGlow} />
          <circle cx={CX - 5} cy={ANTENNA_TOP_Y - 5} r={5} fill="#fff" opacity={0.7} />

          {/* body */}
          <circle cx={CX} cy={BODY_CY} r={BODY_R} fill={BODY} />
          <g clipPath={`url(#${clipId})`}>
            <circle cx={CX + 40} cy={BODY_CY + 70} r={BODY_R} fill="#000" opacity={0.1} />
            <ellipse cx={CX - 60} cy={BODY_CY - 95} rx={50} ry={22} fill="#fff" opacity={0.22} transform={`rotate(-25 ${CX - 60} ${BODY_CY - 95})`} />
          </g>

          {/* face screen */}
          <rect x={SCREEN_X - 6} y={SCREEN_Y - 6} width={SCREEN_W + 12} height={SCREEN_H + 12} rx={62} fill="#000" opacity={0.16} />
          <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H} rx={56} fill={SCREEN} />
          <rect x={SCREEN_X} y={SCREEN_Y} width={SCREEN_W} height={SCREEN_H} rx={56} fill={EYE} opacity={screenPulse} />
          <path
            d={`M${SCREEN_X + 30},${SCREEN_Y + 22} Q${SCREEN_X + 70},${SCREEN_Y + 8} ${SCREEN_X + 120},${SCREEN_Y + 12}`}
            stroke="#fff"
            strokeOpacity={0.12}
            strokeWidth={8}
            strokeLinecap="round"
            fill="none"
          />

          {/* eyes + mouth glow */}
          <g filter={`url(#${glowId})`}>
            {eyes}
            {mouth}
          </g>
        </g>
      </g>
    </svg>
  );
};
