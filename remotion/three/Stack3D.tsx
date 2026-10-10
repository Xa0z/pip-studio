import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog, punch} from '../motion';
import {formatNumber} from '../scenes/common';
import {FONT, useTheme} from '../theme';
import {Canvas3D, type Cam} from './stage3d';

type V = Extract<Visual, {layout: 'bigNumber'}>;

const CAM: Cam = {position: [0, 3.2, 9], target: [0, 0, 0], fov: 34};
const COUNT_FROM = 8;
const COUNT_TO = 46;
const COINS = 9;

/** Big number as a stack of thick discs dropping one on another while the number counts up beside it. */
export const Stack3D: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const value = interpolate(frame, [COUNT_FROM, COUNT_TO], [0, visual.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.exp)});
  const text = `${visual.prefix ?? ''}${formatNumber(value, visual.decimals ?? 0)}`;
  const fontSize = text.length > 8 ? 104 : text.length > 5 ? 130 : 168;
  const label = prog(frame, COUNT_TO - 6, 14);
  const icon = pop(frame, fps, 4, 9);
  const colors = [th.accent, th.accent2, th.accentSoft];
  return (
    <Canvas3D
      cam={CAM}
      overlay={
        <div style={{position: 'absolute', left: 500, top: 70, width: 540, display: 'flex', flexDirection: 'column', gap: 6}}>
          <Icon name={visual.icon} size={110} style={{scale: `${icon}`, rotate: `${(1 - icon) * -30}deg`}} />
          <div style={{fontFamily: FONT, fontWeight: 800, fontSize, lineHeight: 1, letterSpacing: -2, color: th.accent, fontVariantNumeric: 'tabular-nums', scale: `${punch(frame, COUNT_TO - 4, 0.08, 12)}`, transformOrigin: '0% 50%'}}>
            {text}
            {visual.unit ? <span style={{fontSize: fontSize * 0.36, color: th.ink, marginLeft: 12, letterSpacing: 0}}>{visual.unit}</span> : null}
          </div>
          <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 44, lineHeight: 1.15, color: th.inkMuted, opacity: label, translate: `0 ${(1 - label) * 24}px`}}>{visual.label}</div>
        </div>
      }
    >
      <group position={[-2.3, -2.1, 0]} rotation={[0, frame / 90, 0]}>
        <mesh position={[0, -0.12, 0]}>
          <cylinderGeometry args={[1.7, 1.7, 0.16, 64]} />
          <meshLambertMaterial color={th.surface} />
        </mesh>
        {new Array(COINS).fill(0).map((_, i) => {
          const at = COUNT_FROM + i * ((COUNT_TO - COUNT_FROM) / COINS);
          const fall = spring({frame: frame - at, fps, config: {damping: 13, mass: 0.5, stiffness: 160}});
          if (frame < at) return null;
          const y = i * 0.34 + 0.17 + (1 - fall) * 5;
          const wobble = ((i * 37) % 7) / 7 - 0.5;
          return (
            <mesh key={i} position={[wobble * 0.18, y, ((i * 53) % 5) / 25 - 0.1]} rotation={[0, i * 0.7, 0]}>
              <cylinderGeometry args={[1.15, 1.15, 0.3, 48]} />
              <meshLambertMaterial color={colors[i % colors.length]} />
            </mesh>
          );
        })}
      </group>
    </Canvas3D>
  );
};
