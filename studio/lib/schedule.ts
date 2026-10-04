/** Time zones, posting times and slots. All slot math is in UTC. */
export const COMMON_TIMEZONES: {label: string; tz: string}[] = [
  {label: 'Baghdad', tz: 'Asia/Baghdad'},
  {label: 'Riyadh / Kuwait', tz: 'Asia/Riyadh'},
  {label: 'Dubai', tz: 'Asia/Dubai'},
  {label: 'Cairo', tz: 'Africa/Cairo'},
  {label: 'Istanbul', tz: 'Europe/Istanbul'},
  {label: 'London', tz: 'Europe/London'},
  {label: 'New York', tz: 'America/New_York'},
  {label: 'Los Angeles', tz: 'America/Los_Angeles'},
];

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: tz});
    return /\//.test(tz) || tz === 'UTC';
  } catch {
    return false;
  }
}

/** Accepts "Asia/Baghdad", "baghdad", "new york", "UTC+3" style input. */
export function parseTimezone(input: string): string | null {
  const t = input.trim();
  if (isValidTimezone(t)) {
    // Intl accepts any case ("asia/baghdad"); keep the official spelling.
    const exact = (Intl.supportedValuesOf?.('timeZone') ?? []).find((z) => z.toLowerCase() === t.toLowerCase());
    return exact ?? t;
  }
  const common = COMMON_TIMEZONES.find((c) => c.label.toLowerCase().includes(t.toLowerCase()) || c.tz.toLowerCase().endsWith('/' + t.toLowerCase().replace(/\s+/g, '_')));
  if (common) return common.tz;
  const m = /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})$/i.exec(t);
  if (m) {
    const h = Number(m[2]);
    if (h === 0) return 'UTC';
    // Etc/GMT signs are reversed: UTC+3 is Etc/GMT-3.
    const tz = `Etc/GMT${m[1] === '+' ? '-' : '+'}${h}`;
    return isValidTimezone(tz) ? tz : null;
  }
  for (const zone of Intl.supportedValuesOf?.('timeZone') ?? []) {
    if (zone.toLowerCase().endsWith('/' + t.toLowerCase().replace(/\s+/g, '_'))) return zone;
  }
  return null;
}

/** Offset of `tz` from UTC at moment `at`, in ms (local = utc + offset). */
export function tzOffsetMs(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local wall time (y, m, d, "HH:MM") in tz -> UTC Date. Handles DST by re-checking the offset. */
export function localToUtc(y: number, m: number, d: number, hhmm: string, tz: string): Date {
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m, d, h, min);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

export function localParts(at: Date, tz: string) {
  const local = new Date(at.getTime() + tzOffsetMs(at, tz));
  return {y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes(), weekday: local.getUTCDay()};
}

/** Every slot (UTC) from `from` to `to` for these local times. */
export function slotsBetween(times: string[], tz: string, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const start = localParts(new Date(from.getTime() - 86400000), tz);
  for (let day = 0; day < 4 + Math.ceil((to.getTime() - from.getTime()) / 86400000); day++) {
    for (const t of times) {
      const at = localToUtc(start.y, start.m, start.d + day, t, tz);
      if (at >= from && at <= to) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Good default times (local). Evening is the strongest TikTok window for most niches. */
export function suggestTimes(postsPerDay: number): string[] {
  if (postsPerDay <= 1) return ['19:00'];
  if (postsPerDay === 2) return ['12:00', '20:00'];
  return ['09:00', '15:00', '21:00'];
}

export const isTime = (s: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim());
export const normTime = (s: string) => {
  const [h, m] = s.trim().split(':');
  return `${h.padStart(2, '0')}:${m}`;
};

/** "09:00, 21:30" -> sorted, unique, valid times, or null. */
export function parseTimes(text: string, count: number): string[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== count || !parts.every(isTime)) return null;
  const times = [...new Set(parts.map(normTime))].sort();
  return times.length === count ? times : null;
}

export const fmtLocal = (at: Date, tz: string) => {
  const p = localParts(at, tz);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[p.weekday]} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};
