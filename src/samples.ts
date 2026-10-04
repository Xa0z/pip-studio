/** npm run voice:samples -> samples/<voice>.wav, the same Pip line in 3 voices. */
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './config.js';
import {log} from './log.js';
import {voiceSample} from './voice.js';

const LINE =
  "Hi, I'm Pip! Did you know your heart beats about one hundred thousand times every single day? That's a lot of beats! Follow for a new fact every day!";
const VOICES = (process.env.SAMPLE_VOICES ?? 'af_heart,am_puck,bf_emma').split(',');

const dir = path.join(ROOT, 'samples');
fs.mkdirSync(dir, {recursive: true});
for (const v of VOICES) {
  const file = path.join(dir, `${v}.wav`);
  const secs = await voiceSample(LINE, v, file);
  log.ok(`${v}: ${secs.toFixed(1)} s -> samples/${v}.wav`);
}
log.info('Pick one and set "PIP_VOICE" in pip.config.json');
