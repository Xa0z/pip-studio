import {describe, expect, it} from 'vitest';
import {checkCharacterCode} from '../studio/lib/charcheck';
import {FOX_VARIANTS, foxCode} from '../studio/dev/fixtures';

const ok = foxCode(FOX_VARIANTS[0]);
const inject = (snippet: string) => ok.replace(/export const Character/, `${snippet}\nexport const Character`);

describe('character code safety check: known bypasses', () => {
  it.each([
    ['string key built at runtime', "const k = 'con' + 'structor'; const F = (() => 0)[k]; F('return this')();"],
    ['string key from join', "const k = ['con', 'structor'].join(''); const F = (() => 0)[k];"],
    ['key from a fake map', "const o = {map: (f: any) => f(0, 'x')}; o.map((_: any, k: any) => (() => 0)[k]);"],
    ['shadowed Math', "const Math = {floor: () => 'x'}; const F = (() => 0)[Math.floor()];"],
    ['getter named length', "const o = {get length() { return 'x'; }}; const F = (() => 0)[o.length];"],
    ['spread attribute', 'const P = () => <svg {...{ref: (el: any) => el}} />;'],
    ['url split across a template', "const bg = `url(htt${''}ps:/${''}/evil.example/x)`;"],
  ])('rejects %s', (_, snippet) => {
    expect(checkCharacterCode(inject(snippet)).length).toBeGreaterThan(0);
  });

  it.each([
    ['index of a map callback', 'const P = () => <g>{[1, 2].map((x, i) => <circle key={i} r={[3, 4][i]} />)}</g>;'],
    ['numeric constant index', 'const COLORS = [1, 2, 3]; const pick = COLORS[Math.floor(2.5) % COLORS.length];'],
    ['for loop counter', 'const xs = [1, 2]; let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i];'],
  ])('still allows %s', (_, snippet) => {
    expect(checkCharacterCode(inject(snippet))).toEqual([]);
  });
});
