/** Quick checks that need no keys: schema, timeline math, word alignment, history rules. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {alignWords} from './align.js';
import {ROOT} from './config.js';
import {isRepeatTopic, nextCategory} from './history.js';
import {PlanSchema} from './schema.js';
import {buildTimeline, validateTimeline, voiceProblems} from './timeline.js';
import {pausesFor, type VoiceResult} from './voice.js';

let failed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✖ ${name}\n    ${(e as Error).message}`);
  }
};

const fixtures = fs.readdirSync(path.join(ROOT, 'fixtures')).filter((f) => f.endsWith('.json'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', f), 'utf8'));

console.log('Schema');
for (const f of fixtures) {
  test(`fixture ${f} is a valid plan`, () => {
    const r = PlanSchema.safeParse(load(f));
    assert.ok(r.success, r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  });
}
test('rejects a plan with too few scenes and bad hashtags', () => {
  const bad = {...load(fixtures[0]), hashtags: ['science'], scenes: load(fixtures[0]).scenes.slice(0, 5)};
  assert.equal(PlanSchema.safeParse(bad).success, false);
});
test('rejects same layout twice in a row', () => {
  const p = load(fixtures[0]);
  p.scenes[2].visual = p.scenes[1].visual;
  const r = PlanSchema.safeParse(p);
  assert.ok(!r.success && r.error.issues.some((i) => /in a row/.test(i.message)));
});

console.log('Timeline');
const plan = PlanSchema.parse(load(fixtures[0]));
const fakeVoice = (scale: number): VoiceResult => {
  let t = 0.15;
  const sceneStarts: number[] = [];
  const sceneEnds: number[] = [];
  plan.scenes.forEach((s, i) => {
    if (i) t += 0.3;
    sceneStarts.push(t);
    t += s.narration.split(/\s+/).length * 0.36 * scale;
    sceneEnds.push(t);
  });
  return {wavPath: '', words: [], sceneStarts, sceneEnds, speechEnd: t, speed: 1};
};
test('scene frames add up to exactly 1860', () => {
  const v = fakeVoice(1.03);
  const scenes = buildTimeline(plan, v);
  validateTimeline(scenes);
  assert.equal(scenes.reduce((n, s) => n + s.durationInFrames, 0), 1860);
});
test('too-short speech is reported', () => {
  assert.ok(voiceProblems(plan, fakeVoice(0.8)).some((p) => /spoken length/.test(p)));
});
test('pauses stretch to reach the target but keep scenes under 8 s', () => {
  const durs = [3, 5.5, 5.5, 7.6, 5.5, 5.5, 5.5, 5.5, 5, 3];
  const p = pausesFor(durs, 59.5);
  const end = 0.15 + durs.reduce((a, b) => a + b, 0) + p.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(end - 59.5) < 0.01, `ends at ${end}`);
  assert.equal(p[3], 0.3);
  assert.ok(p.every((x, i) => x >= 0.3 && x <= 1 && durs[i] + x <= 7.9));
  assert.deepEqual(pausesFor([3, 4], undefined), [0.3]);
});
test('validateTimeline catches a broken sum', () => {
  const scenes = buildTimeline(plan, fakeVoice(1.03));
  scenes[1].durationInFrames += 1;
  assert.throws(() => validateTimeline(scenes), /add up/);
});

console.log('Word alignment');
test('keeps script words and fills misheard ones', () => {
  const words = alignWords(
    ['Venus', 'spins', 'super', 'slowly.'],
    [
      {text: 'Venice', start: 0.0, end: 0.4},
      {text: 'spins', start: 0.45, end: 0.8},
      {text: 'super', start: 0.85, end: 1.2},
      {text: 'slowly', start: 1.25, end: 1.8},
    ],
    0,
    2,
  );
  assert.deepEqual(words.map((w) => w.text), ['Venus', 'spins', 'super', 'slowly.']);
  assert.ok(words[0].start >= 0 && words[0].end <= words[1].start + 1e-9);
  assert.equal(words[3].start, 1.25);
});

console.log('History');
test('category rotation never repeats', () => {
  assert.equal(nextCategory('space'), 'human_body');
  assert.equal(nextCategory('physics'), 'space');
});
test('detects a repeated topic', () => {
  assert.ok(isRepeatTopic('A day on Venus is longer than a year', ['A day on Venus is longer than its year']));
  assert.equal(isRepeatTopic('Octopuses have three hearts', ['A day on Venus is longer than its year']), null);
});

if (failed) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');
