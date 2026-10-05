import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Scene} from '../../src/schema';
import {ClickRipple, Cursor} from '../components/Cursor';
import {EASE_IN_OUT, pop, prog, punch} from '../motion';
import {FONT, useTheme} from '../theme';
import {typedEnd, TypeText} from './common';

export const TYPE_START = 10;
/** Frame (inside the hook) where the pointer clicks search. */
export const hookClick = (headline: string) => typedEnd(headline, TYPE_START) + 16;
const BAR_LEFT = 60;
const BAR_TOP = 330;
const BAR_W = 960;
const BAR_H = 400;

/**
 * Opens like a screen recording: the question types itself into a search bar,
 * the pointer clicks search, and the key words get marked.
 */
export const HookScene: React.FC<{scene: Scene; title: string}> = ({scene, title}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const badge = pop(frame, fps, 0, 10);
  const bar = pop(frame, fps, 2, 14);
  const end = typedEnd(scene.headline, TYPE_START);
  const click = hookClick(scene.headline);
  const fontSize = scene.headline.length > 30 ? 70 : 84;
  // Pointer glides in from the lower right to the search button, then leaves.
  const btn = {x: BAR_LEFT + BAR_W - 30 - 38, y: BAR_TOP + BAR_H - 24 - 38};
  const glide = prog(frame, end - 10, 24, EASE_IN_OUT);
  const leave = prog(frame, click + 10, 18, EASE_IN_OUT);
  const cx = interpolate(glide, [0, 1], [1100, btn.x - 4]) + leave * 300;
  const cy = interpolate(glide, [0, 1], [900, btn.y - 4]) + leave * 260;
  const press = interpolate(frame, [click - 3, click, click + 5], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const clicked = frame >= click;
  return (
    <>
      <div style={{position: 'absolute', top: 230, width: 1080, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 44,
            color: th.onAccent,
            background: th.accent,
            borderRadius: 40,
            padding: '8px 32px',
            translate: `0 ${(1 - badge) * 40}px`,
            rotate: `${(1 - badge) * -12}deg`,
            opacity: Math.min(1, badge * 2),
            filter: badge < 0.95 ? `blur(${(1 - badge) * 10}px)` : undefined,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: BAR_LEFT,
          top: BAR_TOP,
          width: BAR_W,
          height: BAR_H,
          boxSizing: 'border-box',
          padding: '36px 44px 100px',
          background: th.surface,
          border: `4px solid ${th.ink}`,
          borderRadius: 44,
          opacity: Math.min(1, bar * 1.5),
          scale: `${(0.9 + 0.1 * bar) * punch(frame, click, 0.03, 10)}`,
          rotate: `${(1 - bar) * 4}deg`,
          filter: bar < 0.95 ? `blur(${(1 - bar) * 14}px)` : undefined,
        }}
      >
        <div style={{fontFamily: FONT, fontWeight: 800, fontSize, lineHeight: 1.1, letterSpacing: -1, color: th.ink}}>
          {frame < TYPE_START ? <span style={{color: th.inkMuted, fontWeight: 600}}>Ask anything…</span> : <TypeText text={scene.headline} highlight={scene.highlight} start={TYPE_START} markAt={click + 2} />}
        </div>
        <div style={{position: 'absolute', left: 44, bottom: 30, fontFamily: FONT, fontSize: 56, fontWeight: 400, color: th.inkMuted, lineHeight: 1}}>+</div>
        <div
          style={{
            position: 'absolute',
            right: 30,
            bottom: 24,
            width: 76,
            height: 76,
            borderRadius: 38,
            background: clicked ? th.accent : th.ink,
            color: clicked ? th.onAccent : th.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 42,
            scale: `${1 - press * 0.12}`,
          }}
        >
          ↑
        </div>
      </div>
      <ClickRipple x={btn.x} y={btn.y + 8} p={prog(frame, click, 20)} size={110} />
      {frame > end - 12 && leave < 1 ? <Cursor x={cx} y={cy} press={press} opacity={1 - leave} /> : null}
    </>
  );
};
