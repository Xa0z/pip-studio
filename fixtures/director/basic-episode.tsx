// A small episode used by the tests' fake Claude: one headline card per beat, the character beside it.
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Character, FONT, Icon, KineticText, useBeats, useTheme, type Beat} from '../kit';

const Card: React.FC<{beat: Beat}> = ({beat}) => {
  const th = useTheme();
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200}});
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div style={{width: 900, padding: 60, borderRadius: 40, background: th.surface, border: `4px solid ${th.line}`, translate: `0 ${interpolate(enter, [0, 1], [80, 0])}px`, opacity: enter}}>
        <Icon name={beat.icon ?? 'lightbulb'} size={180} />
        <div style={{fontFamily: FONT, fontWeight: 800, fontSize: 84, color: th.ink, marginTop: 30}}>
          <KineticText text={beat.headline} highlight={beat.highlight} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Episode: React.FC = () => {
  const beats = useBeats();
  const frame = useCurrentFrame();
  const now = beats.find((b) => frame >= b.from && frame < b.from + b.durationInFrames) ?? beats[0];
  return (
    <AbsoluteFill>
      {beats.map((b, i) => (
        <Sequence key={i} from={b.from} durationInFrames={b.durationInFrames}>
          <Card beat={b} />
        </Sequence>
      ))}
      <div style={{position: 'absolute', right: 40, top: 900, width: 300}}>
        <Character expression={now?.pip.expression} pose={now?.pip.pose} width={300} />
      </div>
    </AbsoluteFill>
  );
};
