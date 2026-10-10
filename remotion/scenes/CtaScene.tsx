import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Scene} from '../../src/schema';
import {EASE_OUT, pop, prog} from '../motion';
import {Cursor} from '../components/Cursor';
import {FONT, useTheme} from '../theme';
import {MotionText} from './common';

/** "+ Follow Pip" becomes "✓ Following" after the tap. */
const doneLabel = (l: string) => (/^\+\s*follow\b/i.test(l) ? '✓ Following' : `✓ ${l.replace(/^\+\s*/, '')}`);

export const CTA_TAP = 34;
const TAP = CTA_TAP; // frame the "finger" presses the button

export const CtaScene: React.FC<{scene: Scene; label?: string}> = ({scene, label = '+ Follow Pip'}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = pop(frame, fps, 10, 9);
  const press = interpolate(frame, [TAP - 3, TAP, TAP + 6], [1, 0.9, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_OUT});
  const breathe = frame > TAP + 6 ? 1 + Math.sin((frame - TAP) / 7) * 0.025 : 1;
  const tapped = frame >= TAP;
  const finger = prog(frame, 18, 14);
  const fingerOut = prog(frame, TAP + 14, 12);
  // Pointer comes in from the lower right and lands in the middle of the button.
  const cursorX = 330 + (1 - finger) * 420 + fingerOut * 160;
  const cursorY = 46 + (1 - finger) * 380 + fingerOut * 200;
  const pressDown = interpolate(frame, [TAP - 3, TAP, TAP + 5], [0, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <>
      <div style={{position: 'absolute', top: 330, left: 60, width: 960, textAlign: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 90, lineHeight: 1.06, letterSpacing: -1, color: th.ink}}>
        <MotionText text={scene.headline} highlight={scene.highlight} />
      </div>
      <div style={{position: 'absolute', top: 590, width: 1080, display: 'flex', justifyContent: 'center'}}>
        <div style={{position: 'relative', scale: `${b * press * breathe}`}}>
          {[0, 8].map((d) =>
            tapped ? (
              <div
                key={d}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 16,
                  border: `4px solid ${th.accent}`,
                  scale: `${1 + prog(frame, TAP + d, 24) * 0.5}`,
                  opacity: 1 - prog(frame, TAP + d, 24),
                }}
              />
            ) : null,
          )}
          <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 54, color: tapped ? th.accent : th.onAccent, background: tapped ? th.surface : th.accent, border: `4px solid ${th.accent}`, borderRadius: 16, padding: '16px 48px'}}>
            {tapped ? doneLabel(label) : label}
          </div>
          <Cursor x={cursorX} y={cursorY} press={pressDown} opacity={finger * (1 - fingerOut)} />
        </div>
      </div>
    </>
  );
};
