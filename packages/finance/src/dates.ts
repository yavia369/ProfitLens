import { TZDate } from "@date-fns/tz";

/**
 * Store-local calendar dates as "YYYY-MM-DD" strings. All arithmetic is done on UTC midnights so the
 * host machine's timezone never leaks in; the store timezone is only used to determine "today".
 */
export type LocalDate = string;

export interface DateRange {
  readonly start: LocalDate; // inclusive
  readonly end: LocalDate; // inclusive
}

export const DATE_PRESETS = ["today", "yesterday", "last_7_days", "last_30_days", "this_month", "last_month", "this_year"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const COMPARISON_MODES = ["previous_period", "previous_month", "previous_year", "none"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export type Granularity = "day" | "week" | "month";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(d: LocalDate): Date {
  const m = DATE_RE.exec(d);
  if (!m) throw new TypeError(`invalid local date: ${d}`);
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (date.toISOString().slice(0, 10) !== d) throw new TypeError(`invalid local date: ${d}`);
  return date;
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function isLocalDate(value: string): boolean {
  try {
    toUtc(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(d: LocalDate, days: number): LocalDate {
  const date = toUtc(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds calendar months, clamping the day to the target month's length (Mar 31 − 1 month = Feb 28/29). */
export function addMonths(d: LocalDate, months: number): LocalDate {
  const date = toUtc(d);
  const y = date.getUTCFullYear();
  const total = date.getUTCMonth() + months;
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(ty, tm));
  return fromUtc(new Date(Date.UTC(ty, tm, day)));
}

export function daysBetweenInclusive(range: DateRange): number {
  return Math.round((toUtc(range.end).getTime() - toUtc(range.start).getTime()) / 86_400_000) + 1;
}

/** Today's calendar date in an IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  const z = new TZDate(now.getTime(), timeZone);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Converts a UTC instant to the store-local calendar date. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  return todayIn(timeZone, instant);
}

export function resolvePreset(preset: DatePreset, timeZone: string, now: Date = new Date()): DateRange {
  const today = todayIn(timeZone, now);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { start: y, end: y };
    }
    case "last_7_days":
      return { start: addDays(today, -6), end: today };
    case "last_30_days":
      return { start: addDays(today, -29), end: today };
    case "this_month":
      return { start: firstOfMonth, end: today };
    case "last_month": {
      const start = addMonths(firstOfMonth, -1);
      return { start, end: addDays(firstOfMonth, -1) };
    }
    case "this_year":
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
}

export function comparisonRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  switch (mode) {
    case "none":
      return null;
    case "previous_period": {
      const len = daysBetweenInclusive(range);
      return { start: addDays(range.start, -len), end: addDays(range.start, -1) };
    }
    case "previous_month":
      return { start: addMonths(range.start, -1), end: addMonths(range.end, -1) };
    case "previous_year":
      return { start: addMonths(range.start, -12), end: addMonths(range.end, -12) };
  }
}

export function eachDay(range: DateRange): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Bucket key: the day itself, the Monday starting its ISO week, or the first of its month. */
export function bucketKey(d: LocalDate, granularity: Granularity): LocalDate {
  if (granularity === "day") return d;
  if (granularity === "month") return `${d.slice(0, 7)}-01`;
  const dow = toUtc(d).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

/** Sensible default granularity for a range length. */
export function defaultGranularity(range: DateRange): Granularity {
  const days = daysBetweenInclusive(range);
  if (days <= 45) return "day";
  if (days <= 190) return "week";
  return "month";
}
