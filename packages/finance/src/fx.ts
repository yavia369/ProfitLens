import { addDays, type LocalDate } from "./dates";
import { Decimal, dec, toMoneyString, type MoneyString } from "./money";
import { MONEY_COMPONENTS, type DailyComponents } from "./components";
import type { FxLookup } from "./engine/expenses";

/** One stored exchange rate: 1 `base` = `rate` `quote` on `date`. */
export interface FxRateRow {
  readonly date: LocalDate;
  readonly base: string;
  readonly quote: string;
  readonly rate: MoneyString;
}

/** How far back a missing day may borrow the latest earlier rate (weekends, holidays). */
export const FX_FALLBACK_DAYS = 7;

/**
 * Converter into `target` over stored rates. For each day (that day first, then up to 7 days earlier) it uses a
 * direct rate, the inverse of the opposite rate, or a cross through one pivot currency on that same day (ECB
 * publishes EUR-based rates, so AUD→USD goes AUD→EUR→USD). Never assumes 1:1 for different currencies.
 */
export function fxConverter(rows: readonly FxRateRow[], target: string): FxLookup {
  const pairs = new Map<string, Map<LocalDate, Decimal>>();
  const currencies = new Set<string>();
  for (const r of rows) {
    const key = `${r.base}|${r.quote}`;
    let byDate = pairs.get(key);
    if (!byDate) pairs.set(key, (byDate = new Map()));
    byDate.set(r.date, dec(r.rate));
    currencies.add(r.base).add(r.quote);
  }
  const leg = (from: string, to: string, d: LocalDate): Decimal | null => {
    if (from === to) return new Decimal(1);
    const direct = pairs.get(`${from}|${to}`)?.get(d);
    if (direct && !direct.isZero()) return direct;
    const inverse = pairs.get(`${to}|${from}`)?.get(d);
    return inverse && !inverse.isZero() ? new Decimal(1).div(inverse) : null;
  };
  return (currency, date) => {
    if (currency === target) return new Decimal(1);
    for (let i = 0; i <= FX_FALLBACK_DAYS; i++) {
      const d = addDays(date, -i);
      const direct = leg(currency, target, d);
      if (direct) return direct;
      for (const pivot of currencies) {
        if (pivot === currency || pivot === target) continue;
        const a = leg(currency, pivot, d);
        const b = a ? leg(pivot, target, d) : null;
        if (a && b) return a.times(b);
      }
    }
    return null;
  };
}

/** A day's components with every money field multiplied by `rate` (counts unchanged). */
export function convertComponents(day: DailyComponents, rate: Decimal): DailyComponents {
  const out: Record<string, unknown> = { ...day };
  for (const k of MONEY_COMPONENTS) out[k] = toMoneyString(dec(day[k]).times(rate));
  return out as DailyComponents;
}

/** True when the day carries any money (a day with nothing to convert needs no rate). */
export function hasMoney(day: DailyComponents): boolean {
  return MONEY_COMPONENTS.some((k) => !dec(day[k]).isZero());
}
