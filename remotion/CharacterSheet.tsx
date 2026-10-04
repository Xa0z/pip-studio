/** One preview image of a character: 4 expressions side by side (sent to Telegram during onboarding). */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {CHARACTERS} from './character/registry';
import {Background} from './components/Background';
import {COLORS, FONT} from './theme';
import type {PipExpression, PipPose} from './character/Pip';

export type CharacterSheetProps = {character: string; title: string};

const CELLS: {expression: PipExpression; pose: PipPose; label: string}[] = [
  {expression: 'happy', pose: 'idle', label: 'happy'},
  {expression: 'surprised', pose: 'pointing', label: 'surprised'},
  {expression: 'thinking', pose: 'idle', label: 'thinking'},
  {expression: 'excited', pose: 'waving', label: 'excited'},
];

export const CharacterSheet: React.FC<CharacterSheetProps> = ({character, title}) => {
  const C = CHARACTERS[character] ?? CHARACTERS.pip;
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{alignItems: 'center', paddingTop: 40}}>
        <div style={{fontFamily: FONT, fontWeight: 700, fontSize: 64, color: COLORS.white}}>{title}</div>
        <div style={{display: 'flex', flexWrap: 'wrap', width: 1040, marginTop: 20, justifyContent: 'center'}}>
          {CELLS.map((c) => (
            <div key={c.label} style={{width: 500, height: 470, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end'}}>
              <div style={{width: 330}}>
                <C expression={c.expression} pose={c.pose} talking={false} />
              </div>
              <div style={{fontFamily: FONT, fontWeight: 600, fontSize: 36, color: COLORS.orange, marginTop: 6}}>{c.label}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
