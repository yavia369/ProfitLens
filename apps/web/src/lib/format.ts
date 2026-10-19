/**
 * Presentation formatting only. Inputs are decimal strings from the API; Intl.NumberFormat formats
 * string inputs exactly (no float conversion). No financial calculations happen here.
 */
const LOCALE = "en-AU";

type NumericString = `${number}` | string;

function asIntl(value: NumericString): Intl.StringNumericLiteral {
  return value as Intl.StringNumericLiteral;
}

export function formatMoney(
  value: NumericString | null,
  currency: string,
  opts: { compact?: boolean; asCost?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {},
): string {
  if (value === null) return "—";
  const fmt = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    currencySign: "accounting",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 2,
    minimumFractionDigits: opts.compact ? 0 : 2,
    signDisplay: opts.signDisplay ?? "auto",
  });
  // Costs are stored positive and shown as deductions in accounting parentheses.
  const v = opts.asCost && !value.startsWith("-") && !/^0(\.0*)?$/.test(value) ? `-${value}` : value;
  return fmt.format(asIntl(v));
}

export function formatPercent(ratio: NumericString | null, digits = 1): string {
  if (ratio === null) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(asIntl(ratio));
}

export function formatRatio(value: NumericString | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(asIntl(value))}×`;
}

export function formatCount(value: NumericString | number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(typeof value === "number" ? value : asIntl(value));
}

export function formatChange(change: NumericString | null): string {
  if (change === null) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 }).format(asIntl(change));
}

/** Sign of a decimal string without numeric conversion. */
export function signOf(value: NumericString | null): -1 | 0 | 1 | null {
  if (value === null) return null;
  if (/^-?0*(\.0*)?$/.test(value)) return 0;
  return value.startsWith("-") ? -1 : 1;
}

export function formatDate(localDate: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start, { day: "numeric", month: "short", year: "numeric" });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");
  if (Math.abs(seconds) < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  return rtf.format(-Math.round(seconds / 86400), "day");
}

/** Decimal string for an input field: drops trailing fractional zeros only ("12.500000" → "12.5", "100" stays). */
export function plainAmount(value: string | null | undefined): string {
  if (!value) return "";
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}
