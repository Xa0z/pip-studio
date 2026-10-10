/** Applies the shared LUT (ffmpeg lut3d) to a library file. Graded copies are cached in library/graded/<lut hash>/. */
import fs from 'node:fs';
import path from 'node:path';
import {ensureLut} from './lut.js';
import {ff, Library} from './paths.js';

export function gradeFile(l: Library, rel: string): string {
  const {file: lut, hash} = ensureLut(l);
  const out = path.join(l.graded, hash, rel);
  const src = path.join(l.root, rel);
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) return out;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const vf = `lut3d=file='${lut.replace(/'/g, "\\'")}':interp=tetrahedral`;
  const tmp = out.replace(/(\.[^.]+)$/, '.part$1');
  if (/\.(jpe?g|png|webp)$/i.test(rel)) ff(['-i', src, '-frames:v', '1', '-vf', vf, '-q:v', '2', tmp]);
  else ff(['-i', src, '-an', '-vf', `${vf},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-movflags', '+faststart', tmp], 900000);
  fs.renameSync(tmp, out);
  return out;
}
