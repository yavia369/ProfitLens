import { addDays, addMonths, type LocalDate } from "../dates";
import { Decimal, dec, type MoneyString, ZERO } from "../money";

/** A custom expense (FINANCIAL_MODEL §5.7). Percent is 5 for 5 %. */
export interface ExpenseInput {
  readonly id: string;
  readonly name: string;
  readonly type: "one_time" | "recurring" | "per_order" | "percent_of_revenue" | "percent_of_net_sales" | "percent_of_ad_spend";
  readonly frequency: "daily" | "weekly" | "monthly" | null;
  readonly allocation: "spread" | "on_date";
  readonly amount: MoneyString | null;
  readonly percent: MoneyString | null;
  readonly currency: string;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate | null;
  /** Booked as ad spend instead of an expense (user-flagged). */
  readonly isAdSpend: boolean;
  /** Category is marketing: also counted in MER's denominator. */
  readonly isMarketing: boolean;
}

/** Order-derived bases an expense can depend on, per store-local day (store currency). */
export interface ExpenseBase {
  readonly localDate: LocalDate;
  readonly revenue: Decimal;
  readonly netSales: Decimal;
  readonly adSpend: Decimal;
  readonly ordersCount: number;
}

export interface ExpenseDay {
  readonly fixedExpenses: Decimal;
  readonly variableExpenses: Decimal;
  readonly adLinkedExpenses: Decimal;
  readonly marketingExpenses: Decimal;
  /** Expenses flagged `isAdSpend` (added to ad spend, not to expenses). */
  readonly adSpend: Decimal;
  readonly fxIssues: number;
}

/**
 * Converts an amount into the store currency for a day: 1 unit of `currency` = rate store-currency units.
 * Returns null when no rate is available (the item is then excluded and flagged, FINANCIAL_MODEL §2).
 */
export type FxLookup = (currency: string, date: LocalDate) => Decimal | null;

/** FX lookup over a rate table: the day's rate, else the nearest previous rate within 7 days. */
export function fxLookupFrom(rates: Readonly<Record<string, Readonly<Record<LocalDate, MoneyString>>>>, storeCurrency: string): FxLookup {
  return (currency, date) => {
    if (currency === storeCurrency) return new Decimal(1);
    const byDate = rates[currency];
    if (!byDate) return null;
    for (let i = 0; i <= 7; i++) {
      const r = byDate[addDays(date, -i)];
      if (r) return dec(r);
    }
    return null;
  };
}

/** Occurrence start dates of a recurring expense up to `until` (monthly keeps the start day, clamped to month length). */
function occurrences(e: ExpenseInput, until: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const last = e.endDate && e.endDate < until ? e.endDate : until;
  for (let i = 0; ; i++) {
    const d = e.frequency === "daily" ? addDays(e.startDate, i) : e.frequency === "weekly" ? addDays(e.startDate, 7 * i) : addMonths(e.startDate, i);
    if (d > last) break;
    out.push(d);
  }
  return out;
}

function nextOccurrence(e: ExpenseInput, occ: LocalDate, index: number): LocalDate {
  return e.frequency === "daily" ? addDays(occ, 1) : e.frequency === "weekly" ? addDays(occ, 7) : addMonths(e.startDate, index + 1);
}

function daysBetween(from: LocalDate, toExclusive: LocalDate): number {
  return Math.round((Date.parse(`${toExclusive}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const active = (e: ExpenseInput, d: LocalDate) => e.startDate <= d && (e.endDate === null || d <= e.endDate);

/**
 * Allocates expenses to days (FINANCIAL_MODEL §5.7). Amounts stay unrounded so sums over periods are exact.
 * Recurring: each occurrence on or before the end date is incurred in full; `spread` divides it evenly over
 * the days of its period (actual month length), `on_date` books it on the occurrence date.
 */
export function allocateExpenses(expenses: readonly ExpenseInput[], bases: readonly ExpenseBase[], fx: FxLookup): Map<LocalDate, ExpenseDay> {
  const acc = new Map<LocalDate, { fixed: Decimal; variable: Decimal; adLinked: Decimal; marketing: Decimal; adSpend: Decimal; fx: number }>();
  for (const b of bases) acc.set(b.localDate, { fixed: ZERO, variable: ZERO, adLinked: ZERO, marketing: ZERO, adSpend: ZERO, fx: 0 });
  if (bases.length === 0) return new Map();
  const lastDay = bases.reduce((m, b) => (b.localDate > m ? b.localDate : m), bases[0]!.localDate);

  const book = (e: ExpenseInput, d: LocalDate, amountInExpenseCurrency: Decimal, bucket: "fixed" | "variable" | "adLinked") => {
    const a = acc.get(d);
    if (!a) return;
    const rate = fx(e.currency, d);
    if (rate === null) {
      a.fx += 1;
      return;
    }
    const v = amountInExpenseCurrency.times(rate);
    if (e.isAdSpend) a.adSpend = a.adSpend.plus(v);
    else a[bucket] = a[bucket].plus(v);
    if (e.isMarketing && !e.isAdSpend) a.marketing = a.marketing.plus(v);
  };

  for (const e of expenses) {
    switch (e.type) {
      case "one_time":
        if (e.amount) book(e, e.startDate, dec(e.amount), "fixed");
        break;
      case "recurring": {
        if (!e.amount || !e.frequency) break;
        const amount = dec(e.amount);
        occurrences(e, lastDay).forEach((occ, i) => {
          if (e.allocation === "on_date") return book(e, occ, amount, "fixed");
          const next = nextOccurrence(e, occ, i);
          const n = daysBetween(occ, next);
          for (let k = 0; k < n; k++) book(e, addDays(occ, k), amount.div(n), "fixed");
        });
        break;
      }
      case "per_order":
        if (!e.amount) break;
        for (const b of bases) if (active(e, b.localDate) && b.ordersCount !== 0) book(e, b.localDate, dec(e.amount).times(b.ordersCount), "variable");
        break;
      default: {
        if (!e.percent) break;
        const pct = dec(e.percent).div(100);
        for (const b of bases) {
          if (!active(e, b.localDate)) continue;
          // Percentage expenses are computed on store-currency bases, so no conversion is needed.
          const base = e.type === "percent_of_revenue" ? b.revenue : e.type === "percent_of_net_sales" ? b.netSales : b.adSpend;
          const a = acc.get(b.localDate)!;
          const v = base.times(pct);
          if (e.type === "percent_of_ad_spend") a.adLinked = a.adLinked.plus(v);
          else a.variable = a.variable.plus(v);
          if (e.isMarketing) a.marketing = a.marketing.plus(v);
        }
      }
    }
  }
  const out = new Map<LocalDate, ExpenseDay>();
  for (const [d, a] of acc)
    out.set(d, { fixedExpenses: a.fixed, variableExpenses: a.variable, adLinkedExpenses: a.adLinked, marketingExpenses: a.marketing, adSpend: a.adSpend, fxIssues: a.fx });
  return out;
}
