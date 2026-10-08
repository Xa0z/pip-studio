import fs from 'node:fs';
import {afterEach, describe, expect, it} from 'vitest';
import {fakeRenderer, Harness, runOnboarding} from '../studio/dev/harness';
import type {Renderer} from '../studio/worker/context';
import jpeg from 'jpeg-js';
import {brandFromPixels, contrast, defaultThemeFor, deriveTheme, parseCustomTheme, PRESET_IDS, resolveTheme, type VideoTheme} from '../src/themes';

const OWNER = 5550001;
let h: Harness;
afterEach(() => h?.close());

describe('video themes', () => {
  it('every preset keeps text, captions and buttons readable', () => {
    for (const id of PRESET_IDS) {
      const t = resolveTheme({preset: id});
      expect(contrast(t.ink, t.bg), `${id} text`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.ink, t.surface), `${id} text on cards`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.onAccent, t.accent), `${id} caption word`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.bg), `${id} highlight`).toBeGreaterThanOrEqual(3);
    }
  });

  it('Sage stays exactly the website palette, and no choice means Sage', () => {
    expect(resolveTheme(null)).toEqual(resolveTheme({preset: 'sage'}));
    expect(resolveTheme(null).accent).toBe('#465B53');
    expect(resolveTheme(null).bg).toBe('#EBE5DF');
  });

  it('parses custom colours and rejects pairs that are too close', () => {
    expect(parseCustomTheme('#f2e8dc #a84f2c')).toEqual({ok: true, choice: {preset: 'custom', bg: '#F2E8DC', accent: '#A84F2C'}});
    expect(parseCustomTheme('fff, 123')).toEqual({ok: true, choice: {preset: 'custom', bg: '#FFFFFF', accent: '#112233'}});
    expect(parseCustomTheme('#ffffff')).toEqual({ok: false, error: 'two'});
    expect(parseCustomTheme('red blue')).toEqual({ok: false, error: 'hex'});
    expect(parseCustomTheme('#F2E8DC #E8DCCF')).toEqual({ok: false, error: 'contrast'});
  });

  it('a dark custom background gets light text', () => {
    const t = deriveTheme('#101820', '#F2AA4C');
    expect(t.ink).toBe('#F2F1EC');
    expect(contrast(t.ink, t.bg)).toBeGreaterThan(10);
  });

  it('the theme a user picks in setup is used for their videos', async () => {
    const seen: VideoTheme[] = [];
    const renderer: Renderer = {
      ...fakeRenderer,
      video: (async (opts: {props: {theme?: VideoTheme}; outPath: string}) => {
        if (opts.props.theme) seen.push(opts.props.theme);
        fs.writeFileSync(opts.outPath, Buffer.from('fake mp4'));
      }) as unknown as Renderer['video'],
    };
    h = new Harness({userId: OWNER, ownerId: OWNER, renderer});
    const results = await runOnboarding(h, {theme: '#101820 #F2AA4C'});
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await h.user())!.onboarding_data.video_theme).toEqual({preset: 'custom', bg: '#101820', accent: '#F2AA4C'});
    expect(h.botTexts().join('\n')).toContain('Theme: Custom');
    expect(seen.at(-1)?.bg).toBe('#101820');
    expect(seen.at(-1)?.accent).toBe('#F2AA4C');
  });

  it('can be changed later from /settings', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    await runOnboarding(h, {preset: 'clay'});
    expect((await h.user())!.onboarding_data.video_theme).toEqual({preset: 'clay'});
    await h.press('pv:ok');
    await h.say('/settings');
    await h.press('st:theme');
    await h.press('th:night');
    expect((await h.user())!.onboarding_data.video_theme).toEqual({preset: 'night'});
    expect(h.lastBot()!.text).toContain('Saved');
  });
});

describe('colours for each user, and brand colours', () => {
  it('gives every user their own readable colours', () => {
    const accents = new Set<string>();
    for (let seed = 1000; seed < 1400; seed++) {
      const t = resolveTheme({preset: 'auto', seed});
      expect(contrast(t.ink, t.bg), `${seed} text`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.ink, t.surface), `${seed} text on cards`).toBeGreaterThanOrEqual(7);
      expect(contrast(t.onAccent, t.accent), `${seed} caption word`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.bg), `${seed} highlight`).toBeGreaterThanOrEqual(3);
      accents.add(t.accent);
    }
    expect(accents.size).toBeGreaterThan(300);
    // Neighbouring ids look clearly different.
    expect(resolveTheme({preset: 'auto', seed: 7001}).accent).not.toBe(resolveTheme({preset: 'auto', seed: 7002}).accent);
    expect(defaultThemeFor(42)).toEqual({preset: 'auto', seed: 42});
    expect(defaultThemeFor(42, true)).toEqual({preset: 'sage'});
  });

  it('reads brand colours from typed hex and from logo pixels', () => {
    expect(parseCustomTheme('#FFF8F0 #D2462E #2E5E8C', {brand: true})).toEqual({ok: true, choice: {preset: 'custom', bg: '#FFF8F0', accent: '#D2462E', accent2: '#2E5E8C', brand: true}});
    expect(parseCustomTheme('#FFF8F0 #D2462E #2E5E8C')).toEqual({ok: false, error: 'two'});
    expect(resolveTheme({preset: 'custom', bg: '#FFF8F0', accent: '#D2462E', accent2: '#2E5E8C'}).accent2).toBe('#2E5E8C');
    const choice = brandFromPixels(logoPixels());
    expect(choice).toMatchObject({preset: 'custom', brand: true});
    if (choice?.preset !== 'custom') throw new Error('no colours');
    expect(choice.accent).toBe('#D2462E');
    expect(choice.accent2).toBe('#2E5E8C');
    expect(contrast(choice.accent, choice.bg)).toBeGreaterThanOrEqual(3);
    expect(brandFromPixels(new Uint8Array(400 * 4).fill(255))).toBeNull(); // all white
  });

  it('a new user gets their own colours, or picks a brand theme from their logo', async () => {
    const USER = 7770002;
    const seen: VideoTheme[] = [];
    const renderer: Renderer = {
      ...fakeRenderer,
      video: (async (opts: {props: {theme?: VideoTheme}; outPath: string}) => {
        if (opts.props.theme) seen.push(opts.props.theme);
        fs.writeFileSync(opts.outPath, Buffer.from('fake mp4'));
      }) as unknown as Renderer['video'],
    };
    h = new Harness({userId: USER, ownerId: OWNER, renderer});
    await runOnboarding(h, {preset: 'auto', claudeSecret: 'sk-ant-api03-' + 'k'.repeat(80)});
    expect((await h.user())!.onboarding_data.video_theme).toEqual({preset: 'auto', seed: USER});
    expect(h.botTexts().join('\n')).toMatch(/colours made just for you/);
    expect(seen.at(-1)?.accent).toBe(resolveTheme({preset: 'auto', seed: USER}).accent);

    await h.press('pv:ok').catch(() => undefined);
    await h.say('/settings');
    await h.press('st:theme');
    await h.press('th:brand');
    expect(h.lastBot()!.text).toMatch(/logo as a photo/);
    await h.sendPhoto('logo-1', Buffer.from(jpeg.encode({data: Buffer.from(logoPixels()), width: 40, height: 40}, 95).data));
    expect(h.lastBot()!.text).toMatch(/From your logo I got/);
    await h.press('th:usebrand');
    const t = (await h.user())!.onboarding_data.video_theme;
    expect(t).toMatchObject({preset: 'custom', brand: true});
    expect(h.botTexts().join('\n')).toMatch(/Video theme: <b>Brand/);
  });
});

/** A 40x40 "logo": white background, a big red block and a smaller blue block. */
function logoPixels() {
  const W = 40;
  const px = new Uint8Array(W * W * 4).fill(255);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (x >= 4 && x < 28 && y >= 4 && y < 36) px.set([0xd2, 0x46, 0x2e, 255], i);
      else if (x >= 30 && x < 38 && y >= 10 && y < 30) px.set([0x2e, 0x5e, 0x8c, 255], i);
    }
  return px;
}
