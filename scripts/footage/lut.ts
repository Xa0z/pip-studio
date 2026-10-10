/**
 * The shared colour grade. If library/luts/main.cube is missing, a gentle one is written:
 * soft S-curve contrast, slightly lifted blacks, a touch warmer, about 12% less saturation.
 * Put any free .cube file there instead to change the look of every video.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {Library} from './paths.js';

export function makeLut(size = 33): string {
  const lines = ['TITLE "pip-realedit-main"', `LUT_3D_SIZE ${size}`];
  const curve = (x: number) => {
    const s = x + 0.12 * Math.sin(Math.PI * (x - 0.5)) * (x * (1 - x)) * 4 * 0.5; // soft S
    return 0.025 + s * 0.96; // lifted blacks, rolled-off whites
  };
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        let [R, G, B] = [r, g, b].map((v) => curve(v / (size - 1)));
        const luma = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        [R, G, B] = [R, G, B].map((c) => luma + (c - luma) * 0.88);
        R = R * 1.025 + 0.004;
        B = B * 0.965;
        lines.push([R, G, B].map((c) => Math.min(1, Math.max(0, c)).toFixed(5)).join(' '));
      }
  return lines.join('\n') + '\n';
}

/** Path of the LUT (written if missing) and a short hash, so graded copies are rebuilt when the LUT changes. */
export function ensureLut(l: Library): {file: string; hash: string} {
  const file = path.join(l.luts, 'main.cube');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(l.luts, {recursive: true});
    fs.writeFileSync(file, makeLut());
  }
  const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
  return {file, hash};
}
