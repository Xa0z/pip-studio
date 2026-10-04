import {describe, expect, it} from 'vitest';
import {fmtLocal, localParts, localToUtc, parseTimes, parseTimezone, slotsBetween, suggestTimes} from '../studio/lib/schedule';
import {nextNiche, nicheById} from '../studio/lib/niches';
import {famousCharacter} from '../studio/lib/copyright';

describe('schedule', () => {
  it('turns local times into UTC', () => {
    expect(localToUtc(2026, 9, 5, '21:00', 'Asia/Baghdad').toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(localToUtc(2026, 6, 1, '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localToUtc(2026, 11, 1, '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('handles daylight saving changes', () => {
    // Europe/London moves clocks back on 25 Oct 2026
    const before = slotsBetween(['20:00'], 'Europe/London', new Date('2026-10-24T00:00:00Z'), new Date('2026-10-26T23:00:00Z'));
    expect(before.map((d) => d.toISOString())).toEqual(['2026-10-24T19:00:00.000Z', '2026-10-25T20:00:00.000Z', '2026-10-26T20:00:00.000Z']);
    for (const d of before) expect(localParts(d, 'Europe/London').hour).toBe(20);
  });

  it('suggests 1 to 3 times and parses typed times', () => {
    expect(suggestTimes(1)).toEqual(['19:00']);
    expect(suggestTimes(3)).toHaveLength(3);
    expect(parseTimes('21:30, 9:00', 2)).toEqual(['09:00', '21:30']);
    expect(parseTimes('25:00', 1)).toBeNull();
    expect(parseTimes('09:00 09:00', 2)).toBeNull();
    expect(parseTimes('09:00', 2)).toBeNull();
  });

  it('parses time zones', () => {
    expect(parseTimezone('Asia/Baghdad')).toBe('Asia/Baghdad');
    expect(parseTimezone('asia/baghdad')).toBe('Asia/Baghdad');
    expect(parseTimezone('UTC+3')).toBe('Etc/GMT-3');
    expect(parseTimezone('Mars/Base')).toBeNull();
    expect(fmtLocal(new Date('2026-10-05T18:00:00Z'), 'Asia/Baghdad')).toBe('Mon 21:00');
  });
});

describe('niches and content rules', () => {
  it('rotates between the two niches', () => {
    expect(nextNiche(['science', 'history'], [])).toBe('science');
    expect(nextNiche(['science', 'history'], ['science'])).toBe('history');
    expect(nextNiche(['science'], ['science'])).toBe('science');
    expect(nicheById('custom:Cooking tips').label).toMatch(/Cooking tips/);
  });

  it('refuses famous copyrighted characters', () => {
    expect(famousCharacter('Mickey Mouse in a space suit')).toBeTruthy();
    expect(famousCharacter('a yellow Pikachu')).toBeTruthy();
    expect(famousCharacter('spider-man but blue')).toBeTruthy();
    expect(famousCharacter('a friendly orange fox who loves space')).toBeNull();
  });
});
