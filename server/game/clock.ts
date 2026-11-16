// Section 12 of the directive: the daily clock. All times are UTC milliseconds; dates are "YYYY-MM-DD".

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** The calendar date it is in a time zone at an instant. */
export function localDate(ms: number, tz: string): string {
  return formatter(tz).format(new Date(ms)); // en-CA gives YYYY-MM-DD
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function dateToUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  return new Date(dateToUtc(date) + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b. */
export function dayDiff(a: string, b: string): number {
  return Math.round((dateToUtc(b) - dateToUtc(a)) / DAY);
}

/** 0 = Sunday. */
export function weekday(date: string): number {
  return new Date(dateToUtc(date)).getUTCDay();
}

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dateToUtc(s)) && new Date(dateToUtc(s)).toISOString().slice(0, 10) === s;
}

/**
 * The first instant of a calendar date in a time zone. Found by search rather than arithmetic,
 * so daylight saving, and zones where midnight does not exist on the night the clocks change,
 * need no special cases (rule 12.6).
 */
export function startOfDate(date: string, tz: string): number {
  // whole seconds: lo is always before the date begins, hi is always inside it or after
  let lo = Math.floor((dateToUtc(date) - 15 * HOUR) / 1000);
  let hi = Math.ceil((dateToUtc(date) + 13 * HOUR) / 1000);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid * 1000, tz) >= date) hi = mid;
    else lo = mid;
  }
  return hi * 1000;
}

/** Rule 12.4: midnight at the end of the date, in the journey's time zone. */
export function deadlineFor(date: string, tz: string): number {
  return startOfDate(addDays(date, 1), tz);
}

/** Rule 12.3: a date opens when it begins anywhere on Earth (00:00 at UTC+14)... */
export function dateOpensAt(date: string): number {
  return dateToUtc(date) - 14 * HOUR;
}

/** ...and closes when it has ended everywhere (24:00 at UTC-12). */
export function dateClosesAt(date: string): number {
  return dateToUtc(date) + DAY + 12 * HOUR;
}

/** The latest date that has opened somewhere on Earth. */
export function newestOpenDate(now: number): string {
  return new Date(now + 14 * HOUR).toISOString().slice(0, 10);
}

/** The earliest date that is still current somewhere on Earth. */
export function oldestOpenDate(now: number): string {
  return new Date(now - 12 * HOUR).toISOString().slice(0, 10);
}

export type DateStatus = 'future' | 'live' | 'closed';

export function dateStatus(date: string, now: number): DateStatus {
  if (now < dateOpensAt(date)) return 'future';
  return now >= dateClosesAt(date) ? 'closed' : 'live';
}

/** "Chicago time" */
export function tzLabel(tz: string): string {
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  const city = tz.split('/').pop()!.replace(/_/g, ' ');
  return `${city} time`;
}

/** The server's clock decides (rule 12.5). Tests and the dev tools can shift it. */
let offset = 0;
export function now(): number {
  return Date.now() + offset;
}
export function setClockOffset(ms: number): void {
  offset = ms;
}
export function setClock(ms: number): void {
  offset = ms - Date.now();
}
