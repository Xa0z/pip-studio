/**
 * Characters a render can use, by key. Pip is always here.
 * Pip Studio's worker rewrites this file before a render to add a user's locked
 * character from remotion/character/generated/ (see studio/worker/characters.ts).
 */
import type React from 'react';
import {Pip, type PipProps} from './Pip';

export type CharacterProps = PipProps;

export const CHARACTERS: Record<string, React.FC<CharacterProps>> = {
  pip: Pip,
};
