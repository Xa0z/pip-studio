import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {checkCharacterCode} from '../studio/lib/charcheck';
import {FOX_VARIANTS, foxCode} from '../studio/dev/fixtures';

const ok = foxCode(FOX_VARIANTS[0]);

describe('character code safety check', () => {
  it('accepts plain React + SVG characters', () => {
    for (const v of FOX_VARIANTS) expect(checkCharacterCode(foxCode(v))).toEqual([]);
    const pip = fs.readFileSync('remotion/character/Pip.tsx', 'utf8').replace(/export const Pip\b/, 'export const Character');
    expect(checkCharacterCode(pip)).toEqual([]);
  });

  const bad: [string, string][] = [
    ['network', ok.replace('const bob =', 'fetch("https://evil.example/" + 1); const bob =')],
    ['globals', ok.replace('const bob =', 'const k = window.localStorage; const bob =')],
    ['process', ok.replace('const bob =', 'const k = process.env; const bob =')],
    ['eval', ok.replace('const bob =', 'eval("1"); const bob =')],
    ['imports', ok.replace("import React from 'react';", "import React from 'react';\nimport fs from 'node:fs';")],
    ['remotion helpers that load files', ok.replace("import {interpolate, useCurrentFrame} from 'remotion';", "import {interpolate, useCurrentFrame, staticFile} from 'remotion';")],
    ['images', ok.replace('<ellipse cx={200} cy={470}', '<image href="https://x.example/a.png" /><ellipse cx={200} cy={470}')],
    ['event handlers', ok.replace('<svg viewBox', '<svg onLoad={() => 1} viewBox')],
    ['dangerous html', ok.replace('<svg viewBox', '<svg dangerouslySetInnerHTML={{__html: "x"}} viewBox')],
    ['computed access', ok.replace('const bob =', 'const o: any = {}; const k = o["con" + "structor"]; const bob =')],
    ['no Character export', ok.replace('export const Character', 'export const Other')],
  ];
  for (const [name, code] of bad) {
    it(`rejects ${name}`, () => {
      expect(checkCharacterCode(code).length).toBeGreaterThan(0);
    });
  }

  it('rejects huge code', () => {
    expect(checkCharacterCode(ok + '\n//' + 'x'.repeat(30000))).toContain('code is over 24 KB');
  });
});
