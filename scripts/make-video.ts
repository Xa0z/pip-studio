/**
 * One command: topic or script in, finished real-footage video out.
 *   npx tsx scripts/make-video.ts "how octopuses change colour"
 *   npx tsx scripts/make-video.ts --seconds 20 "Your script. One line per shot idea."
 *   npx tsx scripts/make-video.ts --file my-script.txt
 * Output: out/<slug>.mp4 (crf 18) and out/<slug>.credits.json.
 */
import fs from 'node:fs';
import 'dotenv/config';
import {makeVideo} from './footage/make.js';

const args = process.argv.slice(2);
let maxSeconds: number | undefined;
let text = '';
let fetch = true;
let slug: string | undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--seconds') maxSeconds = Number(args[++i]);
  else if (a === '--file') text = fs.readFileSync(args[++i], 'utf8');
  else if (a === '--slug') slug = args[++i];
  else if (a === '--no-fetch') fetch = false;
  else text += (text ? ' ' : '') + a;
}
if (!text.trim()) {
  console.error('Usage: npx tsx scripts/make-video.ts [--seconds 20] [--no-fetch] [--slug name] "topic or script" | --file script.txt');
  process.exit(1);
}
const looksLikeScript = text.trim().split(/\s+/).length > 18 || (text.match(/[.!?](\s|$)/g)?.length ?? 0) >= 2;
makeVideo({...(looksLikeScript ? {script: text} : {topic: text}), maxSeconds, fetch, slug})
  .then((r) => console.log(JSON.stringify(r, null, 1)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
