import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Pip, PipExpression, PipPose} from './character/Pip';
import {Background} from './components/Background';
import {resolveTheme} from '../src/themes';
import {FONT} from './theme';

// The dev preview always shows the default theme.
const th = resolveTheme(null);

const EXPRESSIONS: PipExpression[] = ['happy', 'surprised', 'thinking', 'excited', 'wink'];
const POSES: PipPose[] = ['idle', 'pointing', 'waving', 'jumping'];

const Cell: React.FC<{label: string; children: React.ReactNode; width: number; scale?: number}> = ({label, children, width, scale = 0.78}) => (
  <div style={{width, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
    <div style={{width: width * scale}}>{children}</div>
    <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 32, color: th.ink}}>{label}</div>
  </div>
);

const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12}}>
    <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 40, color: th.accent, letterSpacing: 2}}>{title}</div>
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', rowGap: 18, width: 1040}}>{children}</div>
  </div>
);

export const PipPreview: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <AbsoluteFill style={{alignItems: 'center', paddingTop: 70, gap: 40}}>
      <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 84, color: th.ink}}>
        Meet <span style={{color: th.accent}}>Pip</span>
      </div>
      <Section title="EXPRESSIONS">
        {EXPRESSIONS.map((e) => (
          <Cell key={e} label={e} width={330}>
            <Pip expression={e} />
          </Cell>
        ))}
        <Cell label="talking" width={330}>
          <Pip expression="happy" talking />
        </Cell>
      </Section>
      <Section title="POSES">
        {POSES.map((p) => (
          <Cell key={p} label={p} width={500} scale={0.5}>
            <Pip pose={p} expression={p === 'jumping' ? 'excited' : 'happy'} />
          </Cell>
        ))}
      </Section>
    </AbsoluteFill>
  </AbsoluteFill>
);
