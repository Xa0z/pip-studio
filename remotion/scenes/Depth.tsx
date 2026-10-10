/** 3D versions of the spotlight and steps layouts, built with CSS perspective (real depth, no WebGL). */
import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {Icon} from '../components/Icons';
import {EASE_OUT, pop, prog, push} from '../motion';
import {FONT, useTheme} from '../theme';
import {Card, KineticText, Stage} from './common';

type Spot = Extract<Visual, {layout: 'spotlight'}>;
type Steps = Extract<Visual, {layout: 'steps'}>;

const TILE = 340;
const THICK = 46;

/** A thick tile that spins in edge-first, lands, and keeps turning a little so you see its sides. */
export const Spotlight3D: React.FC<{visual: Spot}> = ({visual}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const land = spring({frame, fps, config: {damping: 14, mass: 0.8, stiffness: 90}});
  const ry = interpolate(land, [0, 1], [200, -16]) + Math.sin(frame / 22) * 12;
  const rx = interpolate(land, [0, 1], [30, 10]) + Math.cos(frame / 30) * 4;
  const c = prog(frame, 16, 14);
  const face = (style: React.CSSProperties, children?: React.ReactNode) => (
    <div style={{position: 'absolute', boxSizing: 'border-box', backfaceVisibility: 'hidden', ...style}}>{children}</div>
  );
  const half = TILE / 2;
  return (
    <Stage>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <div style={{width: 400, height: 400, perspective: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{position: 'relative', width: TILE, height: TILE, transformStyle: 'preserve-3d', transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${0.6 + 0.4 * land})`}}>
            {face(
              {inset: 0, background: th.surface, border: `4px solid ${th.line}`, borderRadius: 40, transform: `translateZ(${THICK / 2}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center'},
              <Icon name={visual.icon} size={250} />,
            )}
            {face({inset: 0, background: th.accent, borderRadius: 40, transform: `rotateY(180deg) translateZ(${THICK / 2}px)`})}
            {face({left: half - THICK / 2, top: 20, width: THICK, height: TILE - 40, background: th.accent2, transform: `rotateY(90deg) translateZ(${half}px)`})}
            {face({left: half - THICK / 2, top: 20, width: THICK, height: TILE - 40, background: th.accent2, transform: `rotateY(-90deg) translateZ(${half}px)`})}
            {face({left: 20, top: half - THICK / 2, width: TILE - 40, height: THICK, background: th.accentSoft, transform: `rotateX(90deg) translateZ(${half}px)`})}
            {face({left: 20, top: half - THICK / 2, width: TILE - 40, height: THICK, background: th.accentSoft, transform: `rotateX(-90deg) translateZ(${half}px)`})}
          </div>
        </div>
        <Card style={{marginTop: 10, padding: '24px 40px', maxWidth: 880, opacity: c, translate: `0 ${(1 - c) * 40}px`}}>
          <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 48, color: th.ink, textAlign: 'center'}}>
            <KineticText text={visual.caption} highlight={[]} delay={16} stagger={2} />
          </div>
        </Card>
      </div>
    </Stage>
  );
};

/** Steps as cards that flip down from a hinge, one after another, on a floor tilted away from you. */
export const Steps3D: React.FC<{visual: Steps; durationInFrames: number}> = ({visual, durationInFrames}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = visual.steps.length;
  const gap = Math.min(30, Math.floor((durationInFrames * 0.6) / n));
  const tilt = 30 - prog(frame, 0, 60, EASE_OUT) * 8;
  return (
    <Stage height={600}>
      <div style={{perspective: 1300, perspectiveOrigin: '50% 0%'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: n > 3 ? 18 : 28, transformStyle: 'preserve-3d', transform: `rotateX(${tilt}deg)`}}>
          {visual.steps.map((s, i) => {
            const start = 4 + i * gap;
            const flip = spring({frame: frame - start, fps, config: {damping: 13, mass: 0.6, stiffness: 120}});
            const badge = pop(frame, fps, start + 6, 8);
            const lift = push(frame, fps, start);
            return (
              <div
                key={i}
                style={{
                  width: 820 - i * 0,
                  boxSizing: 'border-box',
                  padding: n > 3 ? '14px 30px' : '22px 34px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 28,
                  background: th.surface,
                  border: `3px solid ${th.line}`,
                  borderRadius: 24,
                  boxShadow: `0 12px 0 ${th.accent2}`,
                  transformOrigin: '50% 0%',
                  transform: `translateZ(${i * 30 - (1 - lift) * 120}px) rotateX(${(1 - flip) * -100}deg)`,
                  opacity: frame < start ? 0 : 1,
                }}
              >
                <div style={{width: 64, height: 64, borderRadius: 18, background: th.accent, color: th.onAccent, fontFamily: FONT, fontWeight: 800, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, scale: `${badge}`}}>{i + 1}</div>
                <Icon name={s.icon} size={n > 3 ? 76 : 96} />
                <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 46, color: th.ink}}>{s.text}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
};
