import {describe, expect, it} from 'vitest';
import {beatsFromOnsets} from '../scripts/footage/beats';
import {allowedLicense} from '../scripts/footage/credits';
import {keywordScore, keywordsOf} from '../scripts/footage/index';
import {makeLut} from '../scripts/footage/lut';
import {rng} from '../scripts/footage/paths';
import {MAX_SHOT, MIN_SHOT, planCuts, snap, splitScript} from '../scripts/footage/shots';
import {musicVolume} from '../remotion/realedit/RealEdit';

describe('real-footage videos', () => {
  it('splits a script into lines and sections', () => {
    const lines = splitScript('The Moon drifts away. Four centimetres a year!\n\nIt used to be closer. Days were short.');
    expect(lines.map((l) => l.text)).toEqual(['The Moon drifts away.', 'Four centimetres a year!', 'It used to be closer.', 'Days were short.']);
    expect(lines.map((l) => l.section)).toEqual([0, 0, 1, 1]);
    const long = splitScript('When the tide comes in at night, the whole bay fills with glowing plankton that light up every single wave that breaks.');
    expect(long.length).toBe(2);
  });

  it('cuts shots between 1.2 and 3.5 s, uneven, on every line start', () => {
    const rand = rng('seed');
    const lines = [0.25, 3.1, 9.4, 12.0].map((start, i, a) => ({text: `line ${i}`, section: 0, start, end: a[i + 1] ?? 20}));
    const cuts = planCuts(lines, 20, [], rand);
    expect(cuts[0].start).toBe(0);
    expect(cuts[cuts.length - 1].end).toBe(20);
    for (const c of cuts) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(MIN_SHOT - 1e-6);
      expect(c.end - c.start).toBeLessThanOrEqual(MAX_SHOT + 1e-6);
    }
    for (let i = 1; i < cuts.length; i++) expect(cuts[i].start).toBeCloseTo(cuts[i - 1].end);
    expect(new Set(cuts.map((c) => (c.end - c.start).toFixed(2))).size).toBeGreaterThan(2);
    expect(cuts.filter((c) => c.firstOfLine).map((c) => c.line)).toEqual([0, 1, 2, 3]);
  });

  it('snaps to a nearby beat only', () => {
    expect(snap(2.0, [1.5, 2.1, 3])).toBe(2.1);
    expect(snap(2.0, [1.5, 3])).toBe(2.0);
  });

  it('finds the beat of a steady pulse', () => {
    const hop = 256 / 11025;
    const onset = new Float32Array(2000);
    const period = 0.5; // 120 BPM
    for (let t = 0.1; t < 2000 * hop; t += period) onset[Math.round(t / hop)] = 1;
    const beats = beatsFromOnsets(onset, hop, 10);
    const gaps = beats.slice(1).map((b, i) => b - beats[i]);
    expect(Math.abs(gaps[0] - period)).toBeLessThan(0.03);
  });

  it('accepts only free licences that allow reuse', () => {
    for (const ok of ['CC0', 'Public domain', 'CC BY 4.0', 'CC-BY-3.0', 'Pexels License']) expect(allowedLicense(ok)).toBe(true);
    for (const bad of ['CC BY-SA 4.0', 'CC BY-NC 2.0', 'CC BY-ND 3.0', 'GFDL', '', 'All rights reserved']) expect(allowedLicense(bad)).toBe(false);
    expect(allowedLicense('', 'https://creativecommons.org/licenses/by/4.0/')).toBe(true);
    expect(allowedLicense('', 'https://creativecommons.org/licenses/by-sa/4.0/')).toBe(false);
  });

  it('picks search words and scores tags', () => {
    expect(keywordsOf('An octopus hides on the reef at night.')).toEqual(['octopus', 'hides', 'night', 'reef']);
    expect(keywordScore('An octopus on the reef', 'octopus coral reef video')).toBe(1);
  });

  it('writes a valid LUT', () => {
    const cube = makeLut(5).trim().split('\n');
    expect(cube[1]).toBe('LUT_3D_SIZE 5');
    expect(cube.length).toBe(2 + 125);
  });

  it('ducks the music under the voice and fades it', () => {
    const speech: [number, number][] = [[2, 5]];
    expect(musicVolume(0, 30, 300, speech)).toBe(0);
    expect(musicVolume(45, 30, 300, speech)).toBeCloseTo(0.22);
    expect(musicVolume(100, 30, 300, speech)).toBeCloseTo(0.07);
    expect(musicVolume(299, 30, 300, speech)).toBe(0);
  });
});
