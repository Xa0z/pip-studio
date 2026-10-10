/**
 * makeVideo(input): topic or script in, finished vertical video (1080x1920, 30 fps) made from real footage out.
 *
 *   1. Footage: local library (OpenCLIP index) -> Wikimedia Commons + Internet Archive -> Pexels/Pixabay (if keys).
 *   2. Script to shots: lines, voice timing, varied shot lengths, OpenCLIP matching.
 *   3. Voice (Kokoro, local) + word timings (faster-whisper, local), music (library/music), SFX (library/sfx).
 *   4. Edit in Remotion (remotion/realedit), shared LUT grade, grain, vignette, captions.
 * Every step is logged; a failing step is tried once more, then falls back instead of crashing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {config} from '../../src/config.js';
import {log} from '../../src/log.js';
import type {RealEditProps, RealShot, Sfx, Transition} from '../../remotion/realedit/types.js';
import {detectBeats} from './beats.js';
import {readCredits} from './credits.js';
import {gradeFile} from './grade.js';
import {buildIndex, Candidate, IndexItem, keywordsOf, match, Matcher, MIN_SCORE, readIndex} from './index.js';
import {ensureLut} from './lut.js';
import {ensureLibrary, ff, lib, Library, ROOT, rng, slugify, step, stepOr} from './paths.js';
import {scanLibrary} from './scan.js';
import {isEmphasis, Line, planCuts, splitScript, TimedLine} from './shots.js';
import {fetchFootage, fetchMusic, keys} from './sources.js';
import {captionWords, hear, speakLines} from './voice.js';

const FPS = 30;

export type MakeVideoInput =
  | string
  | {
      topic?: string;
      script?: string;
      maxSeconds?: number; // stop adding lines once the voice would run past this
      outDir?: string; // default out/
      slug?: string;
      voice?: string; // Kokoro voice, default from pip.config.json (af_heart)
      speed?: number;
      library?: string; // default library/ (or REALEDIT_LIBRARY)
      fetch?: boolean; // download missing footage and music (default true)
      writeScript?: (topic: string) => Promise<string>; // the bot can pass its own script writer
    };

export type MakeVideoResult = {video: string; credits: string; props: string; slug: string; seconds: number; shots: number; matcher: Matcher};

const looksLikeScript = (s: string) => s.trim().split(/\s+/).length > 18 || (s.match(/[.!?](\s|$)/g)?.length ?? 0) >= 2;

/** A short factual script for a topic from Wikipedia's free summary API (no key). */
export async function scriptFromWikipedia(topic: string, maxWords = 60): Promise<string> {
  const UA = {'User-Agent': 'PipStudio-RealEdit/1.0 (https://shadhealth.com)'};
  const s = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=${encodeURIComponent(topic)}`, {headers: UA, signal: AbortSignal.timeout(15000)}).then((r) => r.json() as Promise<any>);
  const title = s?.[1]?.[0];
  if (!title) throw new Error(`Wikipedia has no page for "${topic}"`);
  const j = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {headers: UA, signal: AbortSignal.timeout(15000)}).then((r) => r.json() as Promise<any>);
  const sentences = String(j.extract ?? '')
    .replace(/\s*\([^)]*\)/g, '')
    .match(/[^.!?]+[.!?]+/g);
  if (!sentences?.length) throw new Error('empty Wikipedia summary');
  const out: string[] = [];
  let n = 0;
  for (const x of sentences) {
    const w = x.trim().split(/\s+/).length;
    if (out.length && n + w > maxWords) break;
    out.push(x.trim());
    n += w;
  }
  return out.join(' ');
}

function ensureSfx(l: Library) {
  const whoosh = path.join(l.sfx, 'whoosh.wav');
  const hit = path.join(l.sfx, 'hit.wav');
  if (!fs.existsSync(whoosh)) {
    const own = path.join(ROOT, 'assets', 'sfx', 'whoosh.wav');
    if (fs.existsSync(own)) fs.copyFileSync(own, whoosh);
    else ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.45:c=pink:a=0.9:r=44100', '-af', 'highpass=f=350,lowpass=f=3800,afade=t=in:st=0:d=0.22:curve=exp,afade=t=out:st=0.22:d=0.23:curve=exp,volume=4.5', '-ac', '1', whoosh]);
  }
  // Hit: a soft low thump, synthesised here so there is nothing to license.
  if (!fs.existsSync(hit)) ff(['-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*(52+70*exp(-t*30))*t)*exp(-t*9)*0.9:s=44100:d=0.5', '-af', 'lowpass=f=900', '-ac', '1', hit]);
  return {whoosh, hit};
}

function pickMusic(l: Library, rand: () => number): string | null {
  const files = fs.existsSync(l.music) ? fs.readdirSync(l.music).filter((f) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f)).sort() : [];
  return files.length ? path.join(l.music, files[Math.floor(rand() * files.length)]) : null;
}

type Pick = {item: IndexItem; seg: number; score: number};

/** Best footage for each shot: high score, not used before in this video, vertical preferred, clips slightly preferred. */
function assign(cands: Record<string, Candidate[]>, items: IndexItem[], ids: string[]): (Pick | null)[] {
  const byFile = new Map(items.map((i) => [i.file, i]));
  const usedSeg = new Set<string>();
  const usedFile = new Map<string, number>();
  return ids.map((id) => {
    let best: Pick | null = null;
    let bestAdj = -Infinity;
    for (const c of cands[id] ?? []) {
      const item = byFile.get(c.file);
      if (!item || usedSeg.has(`${c.file}#${c.seg}`)) continue;
      const adj = c.score + (item.orientation === 'vertical' ? 0.03 : 0) + (item.kind === 'clip' ? 0.01 : 0) - 0.06 * (usedFile.get(c.file) ?? 0);
      if (adj > bestAdj) [best, bestAdj] = [{item, seg: c.seg, score: c.score}, adj];
    }
    if (best) {
      usedSeg.add(`${best.item.file}#${best.seg}`);
      usedFile.set(best.item.file, (usedFile.get(best.item.file) ?? 0) + 1);
    }
    return best;
  });
}

export async function makeVideo(input: MakeVideoInput): Promise<MakeVideoResult> {
  const opts = typeof input === 'string' ? (looksLikeScript(input) ? {script: input} : {topic: input}) : input;
  const l = ensureLibrary(lib(opts.library ? path.resolve(opts.library) : undefined));
  const allowFetch = opts.fetch !== false;
  const outDir = path.resolve(opts.outDir ?? path.join(ROOT, 'out'));
  fs.mkdirSync(outDir, {recursive: true});

  // ---------- Script ----------
  const script = await step('Script', async () => {
    if (opts.script?.trim()) return opts.script.trim();
    const topic = opts.topic?.trim();
    if (!topic) throw new Error('give a topic or a script');
    if (opts.writeScript) {
      try {
        return (await opts.writeScript(topic)).trim();
      } catch (e) {
        log.warn(`Script writer failed (${(e as Error).message}); using Wikipedia instead`);
      }
    }
    return scriptFromWikipedia(topic, Math.round((opts.maxSeconds ?? 30) * 2.6));
  });
  const slug = opts.slug ?? slugify(opts.topic ?? script.split(/[.!?]/)[0]);
  const rand = rng(script);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `realedit-${slug}-`));
  log.info(`Video "${slug}", work folder ${work}`);

  // ---------- 1. Footage library ----------
  let matcher: Matcher = 'clip';
  const refreshLibrary = async () => {
    await step('Scan library', () => log.info(`${scanLibrary(l).length} files in library/media.json`));
    if (matcher === 'clip') {
      const ok = await stepOr('OpenCLIP index', () => buildIndex(l), false);
      if (!ok) {
        matcher = 'keywords';
        log.warn('OpenCLIP is not available, matching by words instead');
      }
    }
  };
  await refreshLibrary();
  ensureLut(l);

  // ---------- 3. Voice + captions ----------
  let lines: Line[] = splitScript(script);
  const voice = await step('Voice (Kokoro)', () => speakLines(lines, work, rand, opts.voice ?? config.PIP_VOICE, opts.speed ?? config.VOICE_SPEED, opts.maxSeconds ? opts.maxSeconds - 0.8 : undefined));
  lines = lines.slice(0, voice.starts.length);
  const heard = await stepOr('Word timings (faster-whisper)', () => hear(voice.wavPath, path.join(work, 'captions.json')), null);
  const words = captionWords(lines, voice, heard);
  fs.writeFileSync(path.join(work, 'captions.json'), JSON.stringify(words));
  const totalEnd = Math.min(opts.maxSeconds ?? Infinity, voice.speechEnd + 0.9);
  const totalFrames = Math.round(totalEnd * FPS);

  // Music + beats
  let musicPath = pickMusic(l, rand);
  if (!musicPath && allowFetch) {
    const rel = await stepOr('Music (Internet Archive)', () => fetchMusic(l), null);
    musicPath = rel ? path.join(l.root, rel) : null;
  }
  let musicStart = 0;
  let beats: number[] = [];
  if (musicPath) {
    log.info(`Music: ${path.basename(musicPath)}`);
    beats = await stepOr('Beats', () => detectBeats(musicPath!, totalEnd + 1, musicStart), []);
    log.info(`${beats.length} beats found`);
  } else log.warn('No music (put royalty-free tracks in library/music)');

  // ---------- 2. Script to shots ----------
  const timed: TimedLine[] = lines.map((ln, i) => ({...ln, start: voice.starts[i], end: voice.starts[i + 1] ?? totalEnd}));
  const cuts = planCuts(timed, totalEnd, beats, rand);
  log.info(`${lines.length} lines, ${cuts.length} shots: ${cuts.map((c) => (c.end - c.start).toFixed(1)).join(' ')} s`);
  const ids = cuts.map((_, i) => `s${i}`);
  // The word the script uses most: the video's subject, used when a line's own words find nothing.
  const counts = new Map<string, number>();
  for (const ln of lines) for (const w of keywordsOf(ln.text, 20)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const topicWord = keywordsOf(opts.topic ?? '', 1)[0] ?? [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? '';
  const queries = cuts.map((c, i) => ({id: ids[i], text: lines[c.line].text}));

  const matchAll = async () =>
    step('Match footage', () => {
      const items = readIndex(l, matcher);
      return {items, picks: items.length ? assign(match(l, matcher, queries, items), items, ids) : ids.map(() => null)};
    });
  let {items, picks} = await matchAll();
  for (const tier of ['free', 'keyed'] as const) {
    const weak = [...new Set(cuts.filter((_, i) => !picks[i] || picks[i]!.score < MIN_SCORE[matcher]).map((c) => c.line))];
    if (!weak.length || !allowFetch) break;
    if (tier === 'keyed' && !keys().pexels && !keys().pixabay) break;
    const names = tier === 'free' ? 'Wikimedia Commons + Internet Archive' : 'Pexels + Pixabay';
    const got = await stepOr(
      `Fetch footage (${names}) for ${weak.length} line${weak.length > 1 ? 's' : ''}`,
      async () => {
        let n = 0;
        for (const li of weak) {
          const kw = keywordsOf(lines[li].text, 3);
          // Most specific first, then fewer words, then the video's main subject if nothing comes back.
          for (const q of [kw.join(' '), kw.slice(0, 2).join(' '), `${kw[0] ?? ''} ${topicWord}`.trim(), topicWord].filter((x, i, a) => x && a.indexOf(x) === i)) {
            const files = await fetchFootage(l, q, tier, 2);
            n += files.length;
            if (files.length) break;
          }
        }
        return n;
      },
      0,
    );
    if (got > 0) {
      await refreshLibrary();
      ({items, picks} = await matchAll());
    }
  }
  if (!items.length) throw new Error('The footage library is empty and nothing could be downloaded. Add clips to library/clips or photos to library/photos.');
  // Anything still unmatched (tiny library): reuse the best files, a different part where possible.
  picks = picks.map((p, i) => p ?? {item: items[i % items.length], seg: 0, score: 0});

  // ---------- Grade ----------
  const used = [...new Set(picks.map((p) => p!.item.file))];
  const gradedPath = new Map<string, string>();
  let graded = true;
  for (const rel of used) {
    const g = await stepOr(`Grade ${rel}`, () => gradeFile(l, rel), null);
    if (!g) graded = false;
    gradedPath.set(rel, g ?? path.join(l.root, rel));
  }

  // ---------- 4. Edit ----------
  const publicDir = path.join(work, 'public');
  fs.mkdirSync(path.join(publicDir, 'm'), {recursive: true});
  const publicName = new Map<string, string>();
  used.forEach((rel, i) => {
    const name = `m/${i}${path.extname(rel)}`;
    fs.copyFileSync(gradedPath.get(rel)!, path.join(publicDir, name));
    publicName.set(rel, name);
  });
  fs.copyFileSync(voice.wavPath, path.join(publicDir, 'voice.wav'));
  let musicFile: string | null = null;
  if (musicPath) {
    musicFile = `music${path.extname(musicPath)}`;
    fs.copyFileSync(musicPath, path.join(publicDir, musicFile));
  }
  const sfxFiles = await stepOr('SFX', () => ensureSfx(l), null);
  if (sfxFiles) {
    fs.copyFileSync(sfxFiles.whoosh, path.join(publicDir, 'whoosh.wav'));
    fs.copyFileSync(sfxFiles.hit, path.join(publicDir, 'hit.wav'));
  }
  const grainFile = await stepOr(
    'Grain texture',
    () => {
      ff(['-f', 'lavfi', '-i', 'nullsrc=s=512x512,geq=lum=random(1)*255:cb=128:cr=128', '-frames:v', '1', path.join(publicDir, 'grain.png')]);
      return 'grain.png';
    },
    null,
  );

  const sfx: Sfx[] = [];
  let ramps = 0;
  let hits = 0;
  const shots: RealShot[] = cuts.map((c, i) => {
    const p = picks[i]!;
    const start = Math.round(c.start * FPS);
    const end = i === cuts.length - 1 ? totalFrames : Math.round(c.end * FPS);
    const len = end - start;
    const newSection = i > 0 && c.firstOfLine && lines[c.line].section !== lines[cuts[i - 1].line].section;
    let transitionIn: Transition | null = null;
    if (newSection) {
      const r = rand();
      const dir = (['from-left', 'from-right', 'from-bottom'] as const)[Math.floor(rand() * 3)];
      transitionIn = {type: r < 0.5 ? 'fade' : r < 0.8 ? 'slide' : 'wipe', frames: [8, 10, 12][Math.floor(rand() * 3)], direction: dir};
      if (sfxFiles) sfx.push({file: 'whoosh.wav', frame: start - 7, volume: 0.32});
    }
    const emphasis = c.firstOfLine && isEmphasis(lines[c.line].text);
    if (sfxFiles && i > 0 && !transitionIn && emphasis && hits < 3) {
      sfx.push({file: 'hit.wav', frame: start, volume: 0.28});
      hits++;
    }
    const seg = p.item.segments[p.seg] ?? {start: 0, end: p.item.duration};
    const wide = p.item.orientation !== 'vertical';
    const base = {src: publicName.get(p.item.file)!, start, end, transitionIn, focusY: wide ? 0.5 : 0.45, shake: rand() < 0.35 ? Math.floor(rand() * 1e6) : null};
    if (p.item.kind === 'photo') {
      const zoomIn = rand() < 0.65;
      const dx = (rand() - 0.5) * 50;
      const dy = (rand() - 0.5) * 36;
      return {...base, kind: 'photo', trimBefore: 0, punchIn: false, speedRamp: null, kenBurns: {fromScale: zoomIn ? 1.0 : 1.08, toScale: zoomIn ? 1.08 : 1.0, fromX: -dx / 2, fromY: -dy / 2, toX: dx / 2, toY: dy / 2}};
    }
    // Clips: start inside the matched shot, never past the end of the file.
    const segLen = Math.max(0, seg.end - seg.start);
    const need = len / FPS + 0.5;
    const offset = segLen > need ? rand() * Math.min(1.5, segLen - need) : 0;
    const srcStart = Math.max(0, Math.min(seg.start + offset, p.item.duration - need));
    const canRamp = ramps < 2 && len >= 60 && p.item.duration - srcStart > need && rand() < 0.3;
    if (canRamp) ramps++;
    return {...base, kind: 'clip', trimBefore: Math.round(srcStart * FPS), kenBurns: null, punchIn: emphasis || rand() < 0.15, speedRamp: canRamp ? {slowFrames: Math.round(len * 0.4), rate: 0.5} : null, shake: canRamp ? null : base.shake};
  });

  // When the voice is talking (gaps under 0.35 s count as talking), so the music can duck.
  const speech: [number, number][] = [];
  for (const w of words) {
    const last = speech[speech.length - 1];
    if (last && w.start - last[1] < 0.35) last[1] = w.end;
    else speech.push([w.start, w.end]);
  }

  const props: RealEditProps = {shots, words, speech, voiceFile: 'voice.wav', musicFile, musicStart, sfx, graded, grainFile, totalFrames};
  const propsPath = path.join(outDir, `${slug}.props.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 1));
  for (const [i, s] of shots.entries()) log.info(`Shot ${i + 1}: ${((s.end - s.start) / FPS).toFixed(2)} s ${s.kind} ${picks[i]!.item.file} (score ${picks[i]!.score.toFixed(2)})${s.transitionIn ? ` ${s.transitionIn.type} in` : ''}${s.punchIn ? ' punch-in' : ''}${s.speedRamp ? ' speed-ramp' : ''}${s.shake !== null ? ' shake' : ''}`);

  // ---------- Credits ----------
  const credits = readCredits(l);
  const creditOf = (rel: string) => credits[rel] ?? {source: 'own library', license: 'your own file', page: '', author: '', title: path.basename(rel)};
  const creditsPath = path.join(outDir, `${slug}.credits.json`);
  fs.writeFileSync(
    creditsPath,
    JSON.stringify(
      {
        video: `${slug}.mp4`,
        script,
        footage: used.map((rel) => ({file: rel, ...creditOf(rel)})),
        music: musicPath ? {file: path.relative(l.root, musicPath), ...creditOf(path.relative(l.root, musicPath))} : null,
        voice: `Kokoro TTS (${opts.voice ?? config.PIP_VOICE}), Apache-2.0, generated locally`,
        sfx: 'synthesised with ffmpeg, no licence needed',
        matcher,
      },
      null,
      1,
    ),
  );

  // ---------- Render ----------
  const video = path.join(outDir, `${slug}.mp4`);
  await step('Render (Remotion, crf 18)', async () => {
    const serveUrl = await bundle({entryPoint: path.join(ROOT, 'remotion', 'realedit', 'index.ts'), publicDir});
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
    const composition = await selectComposition({serveUrl, id: 'RealEdit', inputProps: props, browserExecutable});
    let last = -10;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: video,
      inputProps: props,
      crf: 18,
      pixelFormat: 'yuv420p',
      imageFormat: 'jpeg',
      jpegQuality: 92,
      audioCodec: 'aac',
      audioBitrate: '256k',
      browserExecutable,
      timeoutInMilliseconds: 120000,
      onProgress: ({progress}) => {
        const pct = Math.floor(progress * 100);
        if (pct >= last + 10) {
          last = pct;
          log.info(`Rendering ${pct}%`);
        }
      },
    });
  });
  fs.rmSync(work, {recursive: true, force: true});
  log.ok(`Done: ${video} (${(totalFrames / FPS).toFixed(1)} s, ${shots.length} shots), credits in ${creditsPath}`);
  return {video, credits: creditsPath, props: propsPath, slug, seconds: totalFrames / FPS, shots: shots.length, matcher};
}
