import React from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {Character, FONT, KineticText, useBeats, useTheme, type Beat} from '../kit';

// ---------- one continuous 3D shot: Earth at the origin, the Moon on a ring around it ----------

const R = 4; // orbit radius
const D0 = 10; // camera distance from the world origin (the camera itself never moves; the world does)
const TAU = Math.PI * 2;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

type View = {tx: number; ty: number; tz: number; d: number; el: number; az: number; lift: number};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** The same angle as `a`, turned by whole circles so it is as close as possible to `ref` (no long spins). */
const near = (a: number, ref: number) => a - TAU * Math.round((a - ref) / TAU);

const moonPos = (theta: number): [number, number, number] => [R * Math.sin(theta), 0, R * Math.cos(theta)];

/** Where the camera looks during each beat (θ is the Moon's place on its orbit right now). */
const viewFor = (i: number, theta: number): View => {
  const [mx, , mz] = moonPos(theta);
  switch (i) {
    case 0: // close-up on the crater face, a little off the Earth line so Earth stays out of shot
      return {tx: mx, ty: 0, tz: mz, d: 6.4, el: 0.12, az: theta + Math.PI + 0.45, lift: 0.25};
    case 1: // dolly back and up: Earth rises into the bottom of the frame, the Moon above it
      return {tx: mx * 0.62, ty: 0, tz: mz * 0.62, d: 15, el: 0.62, az: theta + Math.PI, lift: 0.4};
    case 2: // a little to the side, closer to the Moon, while the axis and arrow appear
      return {tx: mx * 0.8, ty: 0, tz: mz * 0.8, d: 11.5, el: 0.55, az: theta + Math.PI + 0.5, lift: 0.4};
    case 3: // crane up to a top-down view of the whole orbit
    case 4:
      return {tx: 0, ty: 0, tz: 0, d: 27, el: 1.25, az: Math.PI * 2 + 0.2, lift: 0.2};
    case 5: // side view along the Earth-Moon line, to see the stretch
      return {tx: mx * 0.5, ty: 0, tz: mz * 0.5, d: 23, el: 0.9, az: theta + Math.PI / 2, lift: 0.3};
    case 6: // swing behind the Moon to the lit far side
      return {tx: mx, ty: 0, tz: mz, d: 9.5, el: 0.25, az: theta - 0.95, lift: 0.2};
    default: // back to the crater face for the end card
      return {tx: mx, ty: 0, tz: mz, d: 8.5, el: 0.25, az: theta + Math.PI + 0.55, lift: 1.3};
  }
};

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const Moon: React.FC<{theta: number; spin: number; stretch: number; tools: number; arrowTurn: number}> = ({theta, spin, stretch, tools, arrowTurn}) => {
  const th = useTheme();
  // Craters only on the side that faces Earth (the Moon's local +Z after it turns by θ + π).
  const craters: [number, number, number, number][] = [
    [-0.34, 0.3, 0.89, 0.19],
    [0.36, 0.3, 0.88, 0.16],
    [0.04, -0.34, 0.94, 0.21],
    [0.6, -0.22, 0.77, 0.08],
    [-0.62, -0.14, 0.77, 0.09],
  ];
  return (
    <group position={moonPos(theta)} rotation={[0, theta + Math.PI + spin, 0]}>
      <group scale={[1 - 0.18 * stretch, 1 - 0.18 * stretch, 1 + 0.45 * stretch]}>
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <meshStandardMaterial color={th.surface} roughness={0.95} />
        </mesh>
        {craters.map((c, i) => (
          <mesh key={i} position={[c[0], c[1], c[2]]}>
            <sphereGeometry args={[c[3], 32, 32]} />
            <meshStandardMaterial color={th.accent} roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* Spin axis and a curved arrow around the equator */}
      <group scale={[tools, tools, tools]}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, 3.2, 16]} />
          <meshStandardMaterial color={th.ink} roughness={1} />
        </mesh>
        <group rotation={[0, arrowTurn, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.35, 0.05, 12, 64, Math.PI * 1.5]} />
            <meshStandardMaterial color={th.ink} roughness={1} />
          </mesh>
          <mesh position={[1.35, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.16, 0.38, 20]} />
            <meshStandardMaterial color={th.ink} roughness={1} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

const Earth: React.FC = () => {
  const th = useTheme();
  return (
    <group rotation={[0.41, 0, 0]}>
      <mesh>
        <sphereGeometry args={[1.05, 64, 64]} />
        <meshStandardMaterial color={th.accent2} roughness={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.07, 0.035, 12, 96]} />
        <meshStandardMaterial color={th.ink} roughness={1} />
      </mesh>
    </group>
  );
};

const OrbitRing: React.FC<{opacity: number}> = ({opacity}) => {
  const th = useTheme();
  const dots = Array(64).fill(0).map((_, i) => (i / 64) * TAU);
  return (
    <group>
      {dots.map((a, i) => (
        <mesh key={i} position={[R * Math.sin(a), 0, R * Math.cos(a)]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color={th.inkMuted} roughness={1} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
};

// ---------- 2D layer ----------

const Headline: React.FC<{beat: Beat; size?: number}> = ({beat, size = 96}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const out = interpolate(frame, [beat.durationInFrames - 9, beat.durationInFrames], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  return (
    <div style={{position: 'absolute', left: 70, width: 940, top: 190, fontFamily: FONT, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -1.5, color: th.ink, opacity: 1 - out, translate: `0 ${-40 * out}px`}}>
      <KineticText text={beat.headline} highlight={beat.highlight} stagger={3} />
    </div>
  );
};

const Counter: React.FC<{label: string; value: number; y: number; enter: number; punch: number}> = ({label, value, y, enter, punch}) => {
  const th = useTheme();
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: y,
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        padding: '18px 34px',
        borderRadius: 26,
        background: th.surface,
        border: `4px solid ${th.ink}`,
        boxShadow: `0 10px 0 ${th.ink}`,
        fontFamily: FONT,
        translate: `${interpolate(enter, [0, 1], [-520, 0])}px 0`,
        scale: `${1 + 0.08 * punch}`,
      }}
    >
      <span style={{fontWeight: 800, fontSize: 40, letterSpacing: 2, color: th.inkMuted}}>{label}</span>
      <span style={{fontWeight: 800, fontSize: 84, color: th.accent, minWidth: 100, textAlign: 'right'}}>{Math.round(value)}</span>
      <span style={{fontWeight: 700, fontSize: 40, color: th.ink}}>days</span>
    </div>
  );
};

const Tag: React.FC<{text: string; enter: number}> = ({text, enter}) => {
  const th = useTheme();
  return (
    <div style={{position: 'absolute', left: 70, top: 470, padding: '10px 26px', borderRadius: 14, background: th.accent, color: th.onAccent, fontFamily: FONT, fontWeight: 800, fontSize: 40, letterSpacing: 3, opacity: enter, translate: `${(1 - enter) * -60}px 0`}}>
      {text}
    </div>
  );
};

const PartTwo: React.FC = () => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const flip = spring({frame: frame - 6, fps, config: {damping: 14, mass: 0.7}});
  return (
    <div style={{position: 'absolute', left: 0, width: 1080, top: 430, display: 'flex', justifyContent: 'center', perspective: 1400}}>
      <div style={{padding: '26px 60px', borderRadius: 30, background: th.accent, color: th.onAccent, fontFamily: FONT, fontWeight: 800, fontSize: 88, letterSpacing: 2, transform: `rotateX(${(1 - flip) * 90}deg)`, boxShadow: `0 12px 0 ${th.ink}`}}>
        PART 2
      </div>
    </div>
  );
};

// Where Pip stands in each beat (left, top, width in px).
const PIP: [number, number, number][] = [
  [40, 860, 360],
  [770, 960, 270],
  [770, 960, 270],
  [770, 960, 270],
  [740, 900, 300],
  [770, 960, 270],
  [770, 960, 270],
  [330, 800, 420],
];

export const Episode: React.FC = () => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const beats = useBeats();
  const n = beats.length;
  const idx = Math.max(0, beats.findIndex((b) => frame >= b.from && frame < b.from + b.durationInFrames));
  const b = beats[idx];
  const local = frame - b.from;
  const at = (i: number) => beats[Math.min(n - 1, i)];

  // The Moon starts orbiting when the spin is explained and goes round once by the end of the locking beat.
  const orbitStart = at(2).from;
  const orbitFrames = Math.max(1, at(4).from + at(4).durationInFrames - orbitStart);
  const theta = Math.PI + Math.max(0, frame - orbitStart) * (TAU / orbitFrames);

  // Camera: ease from the previous beat's view into this beat's view over about a second.
  const move = interpolate(local, [0, 32], [0, 1], {...clamp, easing: EASE});
  const prev = viewFor(Math.max(0, idx - 1), theta);
  const next = viewFor(idx, theta);
  const nextAz = near(next.az, prev.az);
  const drift = Math.sin(frame / 70) * 0.03;
  const v: View = {
    tx: lerp(prev.tx, next.tx, move),
    ty: lerp(prev.ty, next.ty, move),
    tz: lerp(prev.tz, next.tz, move),
    d: lerp(prev.d, next.d, move) - (idx === 0 ? local * 0.006 : 0),
    el: lerp(prev.el, next.el, move),
    az: lerp(prev.az, nextAz, move) + drift,
    lift: lerp(prev.lift, next.lift, move),
  };

  // Gravity beat: the young Moon is stretched and spins fast, then slows and locks.
  const g = at(5);
  const gp = interpolate(frame, [g.from, g.from + g.durationInFrames * 0.8], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  const inGravity = frame >= g.from && frame < g.from + g.durationInFrames;
  const extraSpin = inGravity ? gp * Math.PI * 6 : 0;
  const stretch = inGravity ? interpolate(frame, [g.from, g.from + 12, g.from + g.durationInFrames * 0.65, g.from + g.durationInFrames - 6], [0, 1, 1, 0], clamp) : 0;

  // Axis and arrow show from the spin beat through the locking beat.
  const tools = interpolate(frame, [at(2).from + 6, at(2).from + 20, at(5).from, at(5).from + 10], [0, 1, 1, 0], clamp);
  const ring = interpolate(frame, [at(3).from, at(3).from + 20, at(6).from, at(6).from + 15, at(7).from, at(7).from + 12], [0, 1, 1, 0.35, 0.35, 0], clamp);

  // Sunlight from the side, swinging round to light the far side, then back for the end.
  const sunSwing = interpolate(frame, [at(6).from, at(6).from + 30, at(7).from, at(7).from + 25], [0, 1, 1, 0], {...clamp, easing: EASE});
  const [mx, , mz] = moonPos(theta);
  const sideSun: [number, number, number] = [-14, 9, 10];
  const farSun: [number, number, number] = [mx * 5, 6, mz * 5];
  const sun: [number, number, number] = [lerp(sideSun[0], farSun[0], sunSwing), lerp(sideSun[1], farSun[1], sunSwing), lerp(sideSun[2], farSun[2], sunSwing)];

  // Counters: SPIN counts in beat 2, ORBIT in beat 3, both punch together in beat 4, leave in beat 5.
  const spinIn = spring({frame: frame - at(2).from - 8, fps, config: {damping: 200}});
  const orbitIn = spring({frame: frame - at(3).from - 8, fps, config: {damping: 200}});
  const leave = interpolate(frame, [at(5).from - 2, at(5).from + 12], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
  const spinValue = interpolate(frame, [at(2).from + 14, at(2).from + at(2).durationInFrames - 10], [0, 27], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const orbitValue = interpolate(frame, [at(3).from + 14, at(3).from + at(3).durationInFrames - 10], [0, 27], {...clamp, easing: Easing.inOut(Easing.cubic)});
  const punch = interpolate(frame, [at(4).from + 4, at(4).from + 10, at(4).from + 22], [0, 1, 0], clamp);
  const showCounters = frame >= at(2).from && frame < at(5).from + 14;

  // Pip glides between spots with a soft spring.
  const pipMove = spring({frame: local, fps, config: {damping: 16, mass: 0.7}});
  const pFrom = PIP[Math.min(7, Math.max(0, idx - 1))];
  const pTo = PIP[Math.min(7, idx)];
  const pip = {left: lerp(pFrom[0], pTo[0], pipMove), y: lerp(pFrom[1], pTo[1], pipMove), w: lerp(pFrom[2], pTo[2], pipMove)};
  const hookPop = spring({frame: frame - 8, fps, config: {damping: 11, mass: 0.6}});
  const hop = b.pip.pose === 'jumping' ? Math.abs(Math.sin((local / fps) * Math.PI * 2.2)) * -30 : 0;

  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{position: [0, 0, D0], fov: 34, near: 0.1, far: 120}}>
        <ambientLight intensity={1.15} />
        <group position={[0, v.lift, D0 - v.d]} rotation={[v.el, 0, 0]}>
          <group rotation={[0, -v.az, 0]}>
            <directionalLight position={sun} intensity={1.7} />
            <group position={[-v.tx, -v.ty, -v.tz]}>
              <Earth />
              <OrbitRing opacity={ring} />
              <Moon theta={theta} spin={extraSpin} stretch={stretch} tools={tools} arrowTurn={frame * 0.06} />
            </group>
          </group>
        </group>
      </ThreeCanvas>

      {beats.map((beat, i) => (
        <Sequence key={i} from={beat.from} durationInFrames={beat.durationInFrames} layout="none">
          {i === 4 || i === 7 ? null : <Headline beat={beat} size={i === 0 ? 112 : 96} />}
        </Sequence>
      ))}

      {showCounters ? (
        <div style={{position: 'absolute', inset: 0, translate: `${-700 * leave}px 0`}}>
          <Counter label="SPIN" value={spinValue} y={520} enter={spinIn} punch={punch} />
          {frame >= at(3).from ? <Counter label="ORBIT" value={orbitValue} y={700} enter={orbitIn} punch={punch} /> : null}
        </div>
      ) : null}

      <Sequence from={at(4).from} durationInFrames={at(4).durationInFrames} layout="none">
        <Headline beat={at(4)} size={120} />
      </Sequence>

      <Sequence from={at(5).from} durationInFrames={at(5).durationInFrames} layout="none">
        <Tag text="LONG AGO" enter={interpolate(frame, [at(5).from + 4, at(5).from + 16, at(5).from + at(5).durationInFrames - 8, at(5).from + at(5).durationInFrames], [0, 1, 1, 0], clamp)} />
      </Sequence>

      <Sequence from={at(7).from} layout="none">
        <PartTwo />
      </Sequence>

      <div style={{position: 'absolute', left: pip.left, top: pip.y + hop + (idx === 0 ? (1 - hookPop) * 500 : 0), width: pip.w}}>
        <Character expression={b.pip.expression} pose={b.pip.pose} width={pip.w} />
      </div>

      {/* A thin frame line keeps the composition tidy on light themes. */}
      <div style={{position: 'absolute', inset: 26, borderRadius: 36, border: `3px solid ${th.line}`}} />
    </AbsoluteFill>
  );
};
