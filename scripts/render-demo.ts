/**
 * Renders the TikTok app-review demo from a raw screen recording.
 *   tsx scripts/render-demo.ts <recording.mp4> <out.mp4> [--still <frame>...]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';

const [input, out, ...rest] = process.argv.slice(2);
if (!input || !out) throw new Error('usage: render-demo.ts <recording.mp4> <out.mp4> [--still <frame>...]');
const ROOT = path.resolve(import.meta.dirname, '..');
const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-demo-'));
fs.copyFileSync(input, path.join(publicDir, 'demo.mp4'));
fs.cpSync(path.join(ROOT, 'assets', 'sfx'), path.join(publicDir, 'sfx'), {recursive: true});

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'remotion', 'demo', 'index.ts'), publicDir});
const composition = await selectComposition({serveUrl, id: 'Demo', inputProps: {sfx: true}, browserExecutable});
console.log(`Demo: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)} s)`);

if (rest[0] === '--still') {
  for (const f of rest.slice(1).map(Number)) {
    const file = out.replace(/\.(png|mp4)$/, '') + `-${f}.png`;
    await renderStill({composition, serveUrl, frame: f, output: file, inputProps: {sfx: true}, browserExecutable});
    console.log(file);
  }
} else {
  let last = -10;
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: out, inputProps: {sfx: true}, browserExecutable,
    crf: 20, x264Preset: 'medium', pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92, audioCodec: 'aac', audioBitrate: '192k',
    concurrency: os.cpus().length,
    onProgress: ({progress}) => {
      const pct = Math.floor(progress * 100);
      if (pct >= last + 10) { last = pct; console.log(`Rendering ${pct}%`); }
    },
  });
  console.log(`Wrote ${out}`);
}
fs.rmSync(publicDir, {recursive: true, force: true});
