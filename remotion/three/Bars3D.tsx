import React, {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog} from '../motion';
import {formatNumber} from '../scenes/common';
import {FONT, useTheme} from '../theme';
import {Canvas3D, makeCamera, project, type Cam} from './stage3d';

type V = Extract<Visual, {layout: 'compare'}>;

const CAM: Cam = {position: [0, 2.2, 9.5], target: [0, 0, 0], fov: 34};
const MAX_H = 3.2;
const BASE = -1.6;

/** Compare as solid 3D columns that grow out of a slab while the camera drifts around them. */
export const Bars3D: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const colors = [th.accent, th.accent2, th.accentSoft, th.inkMuted];
  const n = visual.items.length;
  const max = Math.max(...visual.items.map((i) => i.value));
  const winner = visual.items.findIndex((i) => i.value === max);
  const gap = n <= 2 ? 2.6 : n === 3 ? 2.1 : 1.65;
  const x = (i: number) => (i - (n - 1) / 2) * gap;
  const camera = useMemo(() => makeCamera(CAM), []);
  // Slow turn, starting angled and easing toward front-on.
  const rotY = -0.42 + prog(frame, 0, 70) * 0.3 + Math.sin(frame / 60) * 0.03;
  const slab = pop(frame, fps, 0, 16);
  const done = 8 + (n - 1) * 8 + 30;
  return (
    <Canvas3D
      cam={CAM}
      overlay={visual.items.map((item, i) => {
        const start = 8 + i * 8;
        const grow = pop(frame, fps, start, 14);
        const h = Math.max(0.12, (item.value / max) * MAX_H) * grow;
        const top = project(camera, [x(i), BASE + h + 0.05, 0], rotY);
        const foot = project(camera, [x(i), BASE - 0.2, 0.9], rotY);
        const count = prog(frame, start, 26);
        const decimals = item.value % 1 === 0 ? 0 : 1;
        const isWinner = i === winner && n > 1;
        const crown = isWinner ? pop(frame, fps, done, 9) : 0;
        const show = Math.min(1, grow * 2);
        return (
          <React.Fragment key={i}>
            <div style={{position: 'absolute', left: top.x - 150, top: top.y - 74, width: 300, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: n > 3 ? 40 : 48, color: th.ink, opacity: show, fontVariantNumeric: 'tabular-nums'}}>
              {formatNumber(item.value * count, decimals)}
              <span style={{fontSize: 0.6 * (n > 3 ? 40 : 48), fontWeight: 700, color: th.inkMuted, marginLeft: 8}}>{visual.unit}</span>
              {isWinner ? <div style={{position: 'absolute', left: 150 - 50, top: -44, width: 100, fontSize: 24, fontWeight: 700, color: th.onAccent, background: th.accent, borderRadius: 8, scale: `${crown}`}}>MOST</div> : null}
            </div>
            <div style={{position: 'absolute', left: foot.x - 130, top: foot.y + 6, width: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: prog(frame, start - 4, 12)}}>
              <Icon name={item.icon} size={n > 3 ? 60 : 74} style={{scale: `${pop(frame, fps, start - 2, 9)}`}} />
              <div style={{fontFamily: FONT, fontWeight: 600, fontSize: n > 3 ? 32 : 38, color: th.ink, textAlign: 'center', lineHeight: 1.1}}>{item.label}</div>
            </div>
          </React.Fragment>
        );
      })}
    >
      <group rotation={[0, rotY, 0]}>
        <mesh position={[0, BASE - 0.15, 0]} scale={[slab, 1, slab]}>
          <boxGeometry args={[n * gap + 0.8, 0.3, 2.4]} />
          <meshLambertMaterial color={th.surface} />
        </mesh>
        {visual.items.map((item, i) => {
          const grow = pop(frame, fps, 8 + i * 8, 14);
          const h = Math.max(0.12, (item.value / max) * MAX_H) * Math.max(0.001, grow);
          return (
            <mesh key={i} position={[x(i), BASE + h / 2, 0]}>
              <boxGeometry args={[Math.min(1.1, gap * 0.62), h, 1.1]} />
              <meshLambertMaterial color={colors[i % colors.length]} />
            </mesh>
          );
        })}
      </group>
    </Canvas3D>
  );
};
