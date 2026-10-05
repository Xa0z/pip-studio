import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {SAMPLE_PROPS} from '../remotion/sample';
import {resolveTheme} from '../src/themes';

const out = process.argv[2];
const frames = process.argv[3].split(',').map(Number);
const preset = (process.argv[4] ?? 'sage') as any;
const iconGrid = process.argv[5] === 'grid';
fs.mkdirSync(out, {recursive: true});
const props: any = JSON.parse(JSON.stringify(SAMPLE_PROPS));
props.theme = resolveTheme({preset});
if (iconGrid) props.scenes[4].visual = {layout: 'iconGrid', icon: 'bee', count: 12, label: 'bees in one hive box'};
(async () => {
const serveUrl = await bundle({entryPoint: '/home/claude/pip-studio/remotion/index.ts'});
const composition = await selectComposition({serveUrl, id: 'PipVideo', inputProps: props, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE});
for (const f of frames) {
  await renderStill({composition, serveUrl, output: path.join(out, `f${String(f).padStart(4, '0')}.png`), inputProps: props, frame: f, scale: 0.3, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE});
}
console.log('done', frames.length);
})();
