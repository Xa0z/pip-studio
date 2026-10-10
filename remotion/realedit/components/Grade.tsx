import React from 'react';
import {AbsoluteFill} from 'remotion';

/**
 * One shared grade for every shot. The real grade is the LUT applied with ffmpeg before the render
 * (scripts/footage/grade.ts); if that step could not run, a light CSS grade keeps the shots matching.
 */
export const Grade: React.FC<{graded: boolean; children: React.ReactNode}> = ({graded, children}) => (
  <AbsoluteFill style={{filter: graded ? undefined : 'contrast(1.06) saturate(0.86) sepia(0.06) brightness(0.99)'}}>{children}</AbsoluteFill>
);
