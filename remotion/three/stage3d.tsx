import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';

/** The 3D area: the same place as the 2D Stage (between the headline and the captions). */
export const W3 = 1080;
export const H3 = 640;
export const TOP3 = 600;

export type Cam = {position: [number, number, number]; target: [number, number, number]; fov: number};

/** The camera, built the same way R3F builds it, so we can find where 3D points land on screen. */
export function makeCamera(cam: Cam) {
  const c = new THREE.PerspectiveCamera(cam.fov, W3 / H3, 0.1, 100);
  c.position.set(...cam.position);
  c.lookAt(...cam.target);
  c.updateMatrixWorld();
  return c;
}

/** Where a point inside a group (with rotation `rotY` around Y) lands, in Stage pixels. */
export function project(camera: THREE.PerspectiveCamera, p: [number, number, number], rotY = 0) {
  const v = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  const depth = v.distanceTo(camera.position);
  v.project(camera);
  return {x: ((v.x + 1) / 2) * W3, y: ((1 - v.y) / 2) * H3, depth};
}

/** A transparent WebGL canvas with flat, matte lighting (no glow, no tone mapping, theme colours stay true). */
export const Canvas3D: React.FC<{cam: Cam; children: React.ReactNode; overlay?: React.ReactNode}> = ({cam, children, overlay}) => (
  <div style={{position: 'absolute', left: 0, top: TOP3, width: W3, height: H3}}>
    <ThreeCanvas
      width={W3}
      height={H3}
      flat
      gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}}
      camera={{fov: cam.fov, position: cam.position, near: 0.1, far: 100}}
      onCreated={({camera}) => {
        camera.lookAt(...cam.target);
        camera.updateMatrixWorld();
      }}
    >
      <ambientLight intensity={1.9} />
      <directionalLight position={[4, 8, 6]} intensity={1.5} />
      <directionalLight position={[-6, 2, 3]} intensity={0.35} />
      {children}
    </ThreeCanvas>
    {overlay}
  </div>
);

/** Shared helper: colour string to a THREE colour (theme colours are sRGB hex). */
export const col = (hex: string) => new THREE.Color(hex);
