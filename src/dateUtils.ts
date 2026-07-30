/**
 * Timezone-safe civil-date helpers.
 *
 * All calendar math is done on plain {year, month, day} "civil dates" anchored
 * to NOON UTC. Anchoring at noon (rather than midnight) means adding/subtracting
 * whole days can never cross a DST boundary and flip the date — a real risk for
 * the Australia/Sydney timezone this product targets.
 */

export type CivilDate = { year: number; month: number; day: number }; // month: 0-11
export type CivilDateTime = CivilDate & { hour: number; minute: number };

const MS_PER_DAY = 86_400_000;

const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Civil date -> UTC timestamp, anchored at noon to dodge DST edges. */
export function dateToUTC(d: CivilDate): number {
  return Date.UTC(d.year, d.month, d.day, 12, 0, 0, 0);
}

function fromUTC(ts: number): CivilDate {
  const dt = new Date(ts);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth(), day: dt.getUTCDate() };
}

export function addDays(d: CivilDate, n: number): CivilDate {
  return fromUTC(dateToUTC(d) + n * MS_PER_DAY);
}

/** a - b, in whole days. */
export function diffDays(a: CivilDate, b: CivilDate): number {
  return Math.round((dateToUTC(a) - dateToUTC(b)) / MS_PER_DAY);
}

export function isSameDay(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Sort/compare comparator: negative if a < b. */
export function compareDays(a: CivilDate, b: CivilDate): number {
  return dateToUTC(a) - dateToUTC(b);
}

/** ISO weekday: Monday = 0 ... Sunday = 6. */
export function isoWeekday(d: CivilDate): number {
  const js = new Date(dateToUTC(d)).getUTCDay(); // 0 Sun .. 6 Sat
  return (js + 6) % 7;
}

export function weekdayName(d: CivilDate): string {
  return WEEKDAYS[isoWeekday(d)];
}

export function monthName(month: number): string {
  return MONTHS[month];
}

/**
 * Distinct calendar months spanned by a set of cells, joined chronologically
 * with " / " (deduped). e.g. ["July", "August"] -> "July / August".
 */
export function monthLabel(cells: CivilDate[]): string {
  const names: string[] = [];
  for (const c of cells) {
    const name = monthName(c.month);
    if (!names.includes(name)) names.push(name);
  }
  return names.join(' / ');
}

/**
 * Subtitle time format: 12-hour, no leading zero on hour, 2-digit minutes,
 * lowercase am/pm with no leading space. e.g. 21:30 -> "9:30pm", 0:05 -> "12:05am".
 */
export function formatTime(hour: number, minute: number): string {
  const ampm = hour < 12 ? 'am' : 'pm';
  let h = hour % 12;
  if (h === 0) h = 12;
  const mm = String(minute).padStart(2, '0');
  return `${h}:${mm}${ampm}`;
}

/** Current wall-clock time in the browser's LOCAL timezone as a civil datetime. */
export function localNow(): CivilDateTime {
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

/**
 * Parse a dev-override "mockNow" string. Accepts "YYYY-MM-DDTHH:mm" (the form
 * used in the ?mockDate query param), optionally with seconds or a space
 * separator. Interpreted as wall-clock time, no timezone conversion applied.
 */
export function parseMockDate(input: string): CivilDateTime | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(input.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]) - 1,
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}
