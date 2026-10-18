import { Decimal as DecimalBase } from "decimal.js";

/**
 * Project-wide Decimal constructor: 34 significant digits, banker's rounding (FINANCIAL_MODEL §2).
 * Never use JS numbers for money; parse strings and keep Decimal until presentation.
 */
export const Decimal = DecimalBase.clone({ precision: 34, rounding: DecimalBase.ROUND_HALF_EVEN });
export type Decimal = InstanceType<typeof Decimal>;

export type MoneyString = string;

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

/** Parses a decimal string (as returned by Postgres NUMERIC / Shopify money). Rejects floats-as-numbers. */
export function dec(value: MoneyString | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    throw new TypeError(`invalid decimal string: ${String(value)}`);
  }
  return new Decimal(value);
}

export const ZERO = new Decimal(0);

export function sum(values: Iterable<Decimal>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

/** Serialises for storage/transport with fixed scale (default 6, matching NUMERIC(20,6)). */
export function toMoneyString(value: Decimal, scale = 6): MoneyString {
  return value.toFixed(scale, Decimal.ROUND_HALF_EVEN);
}

/** ISO 4217 minor-unit exponents that differ from 2. */
const CURRENCY_EXPONENT: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 2, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3,
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Rounds to the currency's minor unit (presentation / per-transaction charges). */
export function roundToMinor(value: Decimal, currency: string, rounding: DecimalBase.Rounding = Decimal.ROUND_HALF_EVEN): Decimal {
  return value.toDecimalPlaces(currencyExponent(currency), rounding);
}

/** Ratio that returns null instead of dividing by zero (FINANCIAL_MODEL §6). */
export function ratio(numerator: Decimal, denominator: Decimal): Decimal | null {
  return denominator.isZero() ? null : numerator.div(denominator);
}

/** Relative change (current − previous) / |previous|; null when previous is zero. */
export function relativeChange(current: Decimal, previous: Decimal): Decimal | null {
  return previous.isZero() ? null : current.minus(previous).div(previous.abs());
}
