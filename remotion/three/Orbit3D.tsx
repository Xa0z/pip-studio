import React, {useMemo} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {pop, prog} from '../motion';
import {FONT, useTheme} from '../theme';
import {Canvas3D, makeCamera, project, type Cam} from './stage3d';

type V = Extract<Visual, {layout: 'orbit'}>;

const CAM: Cam = {position: [0, 1.6, 10], target: [0, 0, 0], fov: 32};
const R = 3.3;
const TILT = 0.38; // orbit plane tilt toward the camera

/** Orbit as a real 3D sphere with a tilted ring and a moon that passes in front and behind. */
export const Orbit3D: React.FC<{visual: V}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const camera = useMemo(() => makeCamera(CAM), []);
  const grow = pop(frame, fps, 2, 11);
  const ring = prog(frame, 4, 22);
  const sat = pop(frame, fps, 12, 10);
  const label = prog(frame, 16, 14);
  // Speeds up from rest so the moon feels thrown into orbit.
  const a = frame < 12 ? 0.6 : 0.6 + ((frame - 12) / 26) * Math.min(1, (frame - 12) / 30 + 0.3);
  const satPos: [number, number, number] = [Math.cos(a) * R, Math.sin(a) * R * Math.sin(TILT) + 0.2, Math.sin(a) * R * Math.cos(TILT)];
  const sp = project(camera, satPos);
  const cp = project(camera, [0, 0.2, 0]);
  const behind = satPos[2] < -0.6 && Math.abs(sp.x - cp.x) < 170;
  const spin = frame / 40;
  return (
    <Canvas3D
      cam={CAM}
      overlay={
        <>
          <div style={{position: 'absolute', left: cp.x - 85, top: cp.y - 85, scale: `${grow}`}}>
            <Icon name={visual.center} size={170} />
          </div>
          <div style={{position: 'absolute', left: sp.x - 50, top: sp.y - 50, scale: `${sat * (satPos[2] > 0 ? 1.05 : 0.8)}`, opacity: behind ? 0 : 1}}>
            <Icon name={visual.satellite} size={100} />
          </div>
          <div style={{position: 'absolute', top: 560, width: 1080, textAlign: 'center', fontFamily: FONT, fontWeight: 700, fontSize: 52, color: th.ink, opacity: label, translate: `0 ${(1 - label) * 30}px`}}>{visual.label}</div>
        </>
      }
    >
      <group position={[0, 0.2, 0]}>
        <mesh scale={grow} rotation={[0.3, spin, 0]}>
          <sphereGeometry args={[1.45, 48, 32]} />
          <meshLambertMaterial color={th.accentSoft} />
        </mesh>
        <mesh rotation={[Math.PI / 2 - TILT, 0, 0]} scale={ring}>
          <torusGeometry args={[R, 0.045, 12, 120]} />
          <meshLambertMaterial color={th.accent2} />
        </mesh>
      </group>
      <mesh position={satPos} scale={sat}>
        <sphereGeometry args={[0.62, 32, 24]} />
        <meshLambertMaterial color={th.surface} />
      </mesh>
    </Canvas3D>
  );
};
