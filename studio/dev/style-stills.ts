/**
 * Renders still frames of one fixture in several video styles, to eyeball the variety.
 *   npx tsx studio/dev/style-stills.ts [outDir] [count] [theme]
 * theme: a preset id, or auto:<seed> for per-user colours (each style row gets the next seed).
 * Writes <outDir>/style<N>-<scene>.png. Needs Chromium (REMOTION_BROWSER_EXECUTABLE).
 */
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import venus from '../../fixtures/venus.json' with {type: 'json'};
import type {TimedScene, VideoProps, Word} from '../../src/schema.js';
import {CLASSIC_STYLE, pickStyle, styleLabel, type VideoStyle} from '../../src/styles.js';
import {PRESET_IDS, resolveTheme, type PresetId} from '../../src/themes.js';

const out = path.resolve(process.argv[2] ?? 'out/styles');
const count = Number(process.argv[3] ?? 4);
const themeId = (process.argv[4] ?? 'sage') as PresetId;
fs.mkdirSync(out, {recursive: true});

const TOTAL = 1860;
const each = Math.floor(TOTAL / venus.scenes.length);
const scenes = (venus.scenes as unknown as TimedScene[]).map((s, i, all) => ({...s, from: i * each, durationInFrames: i === all.length - 1 ? TOTAL - i * each : each}));
// Fake word timings spread over each scene, so captions show.
const words: Word[] = scenes.flatMap((s) => {
  const ws = s.narration.split(/\s+/);
  const t0 = s.from / 30 + 0.2;
  const step = (s.durationInFrames / 30 - 0.6) / ws.length;
  return ws.map((text, k) => ({text, start: t0 + k * step, end: t0 + (k + 0.9) * step}));
});

const styles: VideoStyle[] = [];
for (let k = 0; k < count; k++) styles.push(k === 0 && process.env.WITH_CLASSIC ? CLASSIC_STYLE : pickStyle(1000 + k * 7919, styles.slice().reverse()));
// Show every 3D layout at least once: force the last one to "deep".
if (styles.length > 1) styles[styles.length - 1] = {...styles[styles.length - 1], depth: 'deep'};
// STILLS_STYLE='{"hook":"poster"}' forces choices on every style; STILLS_AT=6 grabs frames that far into each scene (mid-cut).
if (process.env.STILLS_STYLE) styles.forEach((s, k) => (styles[k] = {...s, ...JSON.parse(process.env.STILLS_STYLE!)}));
const at = process.env.STILLS_AT ? Number(process.env.STILLS_AT) : null;

// STILLS_MEDIA=<dir with photo.jpg and clip.mp4>: the spotlight scene shows the photo and the compare scene the clip.
const mediaDir = process.env.STILLS_MEDIA ? path.resolve(process.env.STILLS_MEDIA) : null;
if (mediaDir) {
  scenes[4] = {...scenes[4], visual: {layout: 'media', kind: 'photo', query: 'clouds', caption: 'Clouds of acid all day', icon: 'star', src: 'media/photo.jpg'}};
  scenes[3] = {...scenes[3], visual: {layout: 'media', kind: 'clip', query: 'storm', caption: 'Storms that never stop', icon: 'star', src: 'media/clip.mp4', seconds: 5}};
}
const publicDir = mediaDir ? fs.mkdtempSync(path.join(out, 'public-')) : undefined;
if (mediaDir && publicDir) fs.cpSync(mediaDir, path.join(publicDir, 'media'), {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('remotion/index.ts'), publicDir});
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
// Sandboxes behind a TLS proxy can't verify Google Fonts' certificate; this is a local preview tool only.
const chromiumOptions = {ignoreCertificateErrors: !!process.env.STILLS_IGNORE_CERTS};
const shots = [0, 1, 2, 3, 4, 5, 8]; // hook, bigNumber, orbit, compare, spotlight, steps, recap
for (const [k, style] of styles.entries()) {
  const props: VideoProps = {episode: 1, title: 'Space #1', scenes, words, voiceFile: null, musicFile: null, theme: resolveTheme(themeId.startsWith('auto:') ? {preset: 'auto', seed: Number(themeId.slice(5)) + k} : PRESET_IDS.includes(themeId) ? {preset: themeId} : null), style};
  const composition = await selectComposition({serveUrl, id: 'PipVideo', inputProps: props, browserExecutable, chromiumOptions});
  console.log(`style ${k + 1}: ${styleLabel(style)} ${JSON.stringify(style)}`);
  for (const i of shots) {
    const s = scenes[i];
    await renderStill({composition, serveUrl, inputProps: props, output: path.join(out, `style${k + 1}-${String(i).padStart(2, '0')}.png`), frame: s.from + (at ?? Math.min(70, s.durationInFrames - 20)), browserExecutable, chromiumOptions, imageFormat: 'png'});
  }
}
if (publicDir) fs.rmSync(publicDir, {recursive: true, force: true});
console.log(`Stills in ${out}`);
