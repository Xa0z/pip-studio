import fs from 'node:fs';
import {afterEach, describe, expect, it} from 'vitest';
import {fakeRenderer, Harness, runOnboarding} from '../studio/dev/harness';
import type {Renderer} from '../studio/worker/context';
import {contrast, deriveTheme, parseCustomTheme, PRESET_IDS, resolveTheme, type VideoTheme} from '../src/themes';

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

  it('takes a labelled brand palette and keeps every colour readable', () => {
    const palette = 'Primary: #6C8FF5\nSecondary: #A9BDF7\nAccent: #FFD6E7\nBackground: #F7F8FC\nSurface: #FFFFFF\nText: #25283D\nMuted: #7C8199\nHighlight: #FFF0B8';
    const r = parseCustomTheme(palette);
    expect(r).toEqual({
      ok: true,
      choice: {preset: 'custom', bg: '#F7F8FC', accent: '#6C8FF5', accent2: '#A9BDF7', accentSoft: '#FFD6E7', surface: '#FFFFFF', ink: '#25283D', inkMuted: '#7C8199', marker: '#FFF0B8'},
    });
    const t = resolveTheme(r.ok ? r.choice : null);
    expect(t.bg).toBe('#F7F8FC');
    expect(t.accent).toBe('#6C8FF5');
    expect(t.ink).toBe('#25283D');
    expect(t.surface).toBe('#FFFFFF');
    expect(t.marker).toBe('#FFF0B8');
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    // Labels are matched loosely, and a pale highlight never becomes the main accent.
    expect(parseCustomTheme('- background = #ffffff\n- highlight: #fff0b8\n- brand colour: #1f2124')).toMatchObject({ok: true, choice: {bg: '#FFFFFF', accent: '#1F2124', marker: '#FFF0B8'}});
    expect(parseCustomTheme('Background: #FFFFFF\nHighlight: #FFF0B8')).toEqual({ok: false, error: 'contrast'});
    // Unreadable extras fall back to derived colours.
    expect(resolveTheme({preset: 'custom', bg: '#F7F8FC', accent: '#6C8FF5', ink: '#EEEEEE'}).ink).toBe('#24272A');
    // Unlabelled lists still use the first two colours.
    expect(parseCustomTheme('#F2E8DC #A84F2C #FFFFFF')).toEqual({ok: true, choice: {preset: 'custom', bg: '#F2E8DC', accent: '#A84F2C'}});
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

  it('the bot accepts a pasted brand palette and says which colours it picked', async () => {
    h = new Harness({userId: OWNER, ownerId: OWNER});
    const results = await runOnboarding(h, {theme: 'Primary: #6C8FF5\nBackground: #F7F8FC\nText: #25283D\nHighlight: #FFF0B8'});
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await h.user())!.onboarding_data.video_theme).toEqual({preset: 'custom', bg: '#F7F8FC', accent: '#6C8FF5', ink: '#25283D', marker: '#FFF0B8'});
    const texts = h.botTexts().join('\n');
    expect(texts).toContain('Got your colours');
    expect(texts).not.toContain('I need two colours');
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
