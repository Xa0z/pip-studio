/**
 * Scans the footage library and writes library/media.json (ffprobe: duration, size, fps, orientation),
 * then updates the OpenCLIP index (library/index.json) if Python and open_clip_torch are installed.
 *   npx tsx scripts/scan-media.ts [library-folder] [--no-index]
 */
import {buildIndex} from './footage/index.js';
import {ensureLut} from './footage/lut.js';
import {ensureLibrary, lib} from './footage/paths.js';
import {scanLibrary} from './footage/scan.js';

const args = process.argv.slice(2);
const l = ensureLibrary(lib(args.find((a) => !a.startsWith('--'))));
const items = scanLibrary(l);
ensureLut(l);
console.log(`${items.length} files (${items.filter((i) => i.kind === 'clip').length} clips, ${items.filter((i) => i.kind === 'photo').length} photos) -> ${l.media}`);
if (!args.includes('--no-index')) {
  try {
    buildIndex(l);
  } catch (e) {
    console.warn(`OpenCLIP index skipped: ${(e as Error).message}`);
  }
}
