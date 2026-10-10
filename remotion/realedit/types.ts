/** Props of the RealEdit composition. Built by scripts/footage/make.ts; the bot can pass the same data. */
export type Transition = {type: 'fade' | 'slide' | 'wipe'; frames: number; direction: 'from-left' | 'from-right' | 'from-bottom'};

export type RealShot = {
  src: string; // file in the render's public folder
  kind: 'clip' | 'photo';
  start: number; // frame on the video timeline where the cut lands
  end: number;
  trimBefore: number; // clips: source frame (at 30 fps) shown at `start`
  transitionIn: Transition | null; // only between sections; everything else is a hard cut
  kenBurns: {fromScale: number; toScale: number; fromX: number; fromY: number; toX: number; toY: number} | null; // photos
  punchIn: boolean; // clips: 1.0 -> 1.04 on emphasis lines
  speedRamp: {slowFrames: number; rate: number} | null; // clips: slow-mo, then normal speed
  shake: number | null; // seed for subtle handheld shake, null for a locked-off shot
  focusY: number; // 0..1, where to crop a wide shot vertically (0.5 = middle)
};

export type CaptionWord = {text: string; start: number; end: number}; // seconds

export type Sfx = {file: string; frame: number; volume: number};

export type RealEditProps = {
  shots: RealShot[];
  words: CaptionWord[];
  speech: [number, number][]; // seconds when the voice is talking (music ducks under it)
  voiceFile: string | null;
  musicFile: string | null;
  musicStart: number; // seconds into the track
  sfx: Sfx[];
  graded: boolean; // true when the LUT was applied with ffmpeg; else a light CSS grade is used
  grainFile: string | null;
  totalFrames: number;
};
