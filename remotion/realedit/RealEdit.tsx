import {Audio, Video} from '@remotion/media';
import {TransitionPresentation, TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import React from 'react';
import {AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Captions} from './components/Captions';
import {Grade} from './components/Grade';
import {Grain} from './components/Grain';
import {KenBurns} from './components/KenBurns';
import {Shake} from './components/Shake';
import {Vignette} from './components/Vignette';
import type {RealEditProps, RealShot, Transition} from './types';

const ease = Easing.bezier(0.45, 0, 0.55, 1);

const ClipShot: React.FC<{shot: RealShot; lead: number; duration: number}> = ({shot, lead, duration}) => {
  const frame = useCurrentFrame();
  // Punch-in: 1.0 -> 1.04 over the first half of the shot, then hold.
  const zoom = shot.punchIn ? interpolate(frame, [lead, lead + Math.max(6, duration * 0.5)], [1, 1.04], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease}) : 1;
  const style: React.CSSProperties = {width: '100%', height: '100%', transform: `scale(${zoom})`};
  const src = staticFile(shot.src);
  const start = Math.max(0, shot.trimBefore - lead);
  if (!shot.speedRamp) return <Video src={src} muted trimBefore={start} objectFit="cover" style={{...style, objectPosition: `50% ${shot.focusY * 100}%`}} />;
  // Speed ramp: slow-mo first, then normal speed from where the slow part left off.
  const slow = shot.speedRamp.slowFrames;
  return (
    <>
      <Sequence durationInFrames={slow} layout="none">
        <Video src={src} muted trimBefore={start} playbackRate={shot.speedRamp.rate} objectFit="cover" style={{...style, objectPosition: `50% ${shot.focusY * 100}%`}} />
      </Sequence>
      <Sequence from={slow} layout="none">
        <Video src={src} muted trimBefore={Math.round(start + slow * shot.speedRamp.rate)} objectFit="cover" style={{...style, objectPosition: `50% ${shot.focusY * 100}%`}} />
      </Sequence>
    </>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentation = (t: Transition): TransitionPresentation<any> => (t.type === 'slide' ? slide({direction: t.direction}) : t.type === 'wipe' ? wipe({direction: t.direction}) : fade());

/** Music level: lower while the voice talks, with smooth 6-frame moves, plus fade in and out. */
export const musicVolume = (frame: number, fps: number, total: number, speech: [number, number][]) => {
  const t = frame / fps;
  const ramp = 0.2; // seconds
  let talk = 0;
  for (const [a, b] of speech) {
    if (t < a - ramp || t > b + ramp) continue;
    talk = Math.max(talk, Math.min(1, (t - (a - ramp)) / ramp, (b + ramp - t) / ramp));
  }
  const level = 0.22 - 0.15 * talk;
  const fadeIn = interpolate(frame, [0, fps * 1.2], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(frame, [total - fps * 1.6, total - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return level * fadeIn * fadeOut;
};

export const RealEdit: React.FC<RealEditProps> = (p) => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <Grade graded={p.graded}>
        <TransitionSeries>
          {p.shots.map((shot, i) => {
            // Half of each transition overlaps the shot before, half the shot after, so cuts stay on the voice.
            const lead = shot.transitionIn ? shot.transitionIn.frames / 2 : 0;
            const next = p.shots[i + 1]?.transitionIn;
            const tail = next ? next.frames / 2 : 0;
            const duration = shot.end - shot.start + lead + tail;
            return (
              <React.Fragment key={i}>
                {shot.transitionIn && i > 0 ? <TransitionSeries.Transition presentation={presentation(shot.transitionIn)} timing={linearTiming({durationInFrames: shot.transitionIn.frames})} /> : null}
                <TransitionSeries.Sequence durationInFrames={duration}>
                  <Shake seed={shot.shake}>
                    {shot.kind === 'photo' && shot.kenBurns ? <KenBurns src={staticFile(shot.src)} move={shot.kenBurns} focusY={shot.focusY} duration={duration} /> : <ClipShot shot={shot} lead={lead} duration={duration} />}
                  </Shake>
                </TransitionSeries.Sequence>
              </React.Fragment>
            );
          })}
        </TransitionSeries>
      </Grade>
      <Vignette />
      <Grain file={p.grainFile} />
      <Captions words={p.words} />
      {p.voiceFile ? <Audio src={staticFile(p.voiceFile)} /> : null}
      {p.musicFile ? <Audio src={staticFile(p.musicFile)} trimBefore={Math.round(p.musicStart * fps)} volume={(f) => musicVolume(f, fps, p.totalFrames, p.speech)} /> : null}
      {p.sfx.map((s, i) => (
        <Sequence key={i} from={Math.max(0, s.frame)} durationInFrames={fps * 2} layout="none">
          <Audio src={staticFile(s.file)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
