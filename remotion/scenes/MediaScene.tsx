import React from 'react';
import {Img, interpolate, Loop, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Visual} from '../../src/schema';
import {prog} from '../motion';
import {FONT, useStyle, useTheme} from '../theme';
import {Card, KineticText} from './common';
import {SpotlightScene} from './SpotlightScene';

type V = Extract<Visual, {layout: 'media'}>;

const W = 880;
const H = 600;
const TOP = 590;

/**
 * A real photo or clip from a free library, in a flat frame with a solid offset block behind it
 * (like a printed card), a slow push-in, and the caption underneath. In 3D-style videos the frame
 * swings in with perspective. Without a file it falls back to the icon spotlight.
 */
export const MediaScene: React.FC<{visual: V; durationInFrames: number}> = ({visual, durationInFrames}) => {
  const th = useTheme();
  const style = useStyle();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!visual.src) return <SpotlightScene visual={{layout: 'spotlight', icon: visual.icon, caption: visual.caption}} />;
  const land = spring({frame, fps, config: {damping: 15, mass: 0.7, stiffness: 110}});
  const deep = style.depth !== 'flat';
  const swing = deep ? interpolate(land, [0, 1], [28, -4]) + Math.sin(frame / 40) * 2 : 0;
  // Ken Burns: slow zoom in and a little drift, so a still photo never sits dead.
  const zoom = interpolate(frame, [0, durationInFrames], [1.12, 1.0]);
  const drift = interpolate(frame, [0, durationInFrames], [-24, 24]);
  const block = prog(frame, 6, 14);
  const cap = prog(frame, 14, 14);
  const clipFrames = Math.max(1, Math.floor((visual.seconds ?? 10) * fps));
  return (
    <>
      <div style={{position: 'absolute', left: (1080 - W) / 2, top: TOP, width: W, height: H, perspective: 1600}}>
        <div style={{position: 'absolute', inset: 0, background: th.accent, borderRadius: 34, translate: `${block * 18}px ${block * 18}px`, opacity: block}} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 34,
            overflow: 'hidden',
            border: `5px solid ${th.ink}`,
            background: th.surface,
            transform: `rotateY(${swing}deg) scale(${0.85 + 0.15 * land})`,
            opacity: Math.min(1, land * 2),
          }}
        >
          <div style={{position: 'absolute', inset: 0, scale: `${zoom}`, translate: `${drift}px 0`}}>
            {visual.kind === 'clip' ? (
              <Loop durationInFrames={clipFrames}>
                <OffthreadVideo src={staticFile(visual.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </Loop>
            ) : (
              <Img src={staticFile(visual.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            )}
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', top: TOP + H + 30, width: 1080, display: 'flex', justifyContent: 'center'}}>
        <Card style={{padding: '14px 34px', maxWidth: 880, opacity: cap, translate: `0 ${(1 - cap) * 30}px`}}>
          <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 42, color: th.ink, textAlign: 'center'}}>
            <KineticText text={visual.caption} highlight={[]} delay={16} stagger={2} />
          </div>
        </Card>
      </div>
    </>
  );
};
