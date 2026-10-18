import { Decimal, dec, toMoneyString, ZERO } from "./money";

/**
 * Additive daily components (FINANCIAL_MODEL §9). Mirrors `daily_store_metrics`.
 * Money fields are decimal strings; counts are integers.
 */
export const MONEY_COMPONENTS = [
  "grossSales",
  "discounts",
  "returns",
  "shippingCharged",
  "tips",
  "adjustments",
  "dutiesAndFees",
  "taxes",
  "giftCardSales",
  "revenue",
  "cogs",
  "shippingCost",
  "handlingCost",
  "transactionFees",
  "chargebackLoss",
  "chargebackFees",
  "adSpend",
  "variableExpenses",
  "adLinkedExpenses",
  "fixedExpenses",
  "marketingExpenses",
  "revenueMissingCogs",
  "feesEstimatedAmount",
  "unclassifiedSalesAmount",
] as const;

export const COUNT_COMPONENTS = [
  "ordersCount",
  "unitsSold",
  "newCustomers",
  "ordersMissingCogs",
  "ordersMissingShipping",
  "transactionsMissingFees",
  "fxIssues",
] as const;

export type MoneyComponent = (typeof MONEY_COMPONENTS)[number];
export type CountComponent = (typeof COUNT_COMPONENTS)[number];

export type DailyComponents = { readonly localDate: string } & Readonly<Record<MoneyComponent, string>> &
  Readonly<Record<CountComponent, number>>;

/** Summed components as Decimals, ready for metric derivation. */
export type ComponentTotals = Readonly<Record<MoneyComponent, Decimal>> & Readonly<Record<CountComponent, number>>;

export function emptyTotals(): ComponentTotals {
  const money = Object.fromEntries(MONEY_COMPONENTS.map((k) => [k, ZERO])) as Record<MoneyComponent, Decimal>;
  const counts = Object.fromEntries(COUNT_COMPONENTS.map((k) => [k, 0])) as Record<CountComponent, number>;
  return { ...money, ...counts };
}

export function sumComponents(rows: Iterable<DailyComponents>): ComponentTotals {
  const money = Object.fromEntries(MONEY_COMPONENTS.map((k) => [k, ZERO])) as Record<MoneyComponent, Decimal>;
  const counts = Object.fromEntries(COUNT_COMPONENTS.map((k) => [k, 0])) as Record<CountComponent, number>;
  for (const row of rows) {
    for (const k of MONEY_COMPONENTS) money[k] = money[k].plus(dec(row[k]));
    for (const k of COUNT_COMPONENTS) counts[k] += row[k];
  }
  return { ...money, ...counts };
}

/** Builds a DailyComponents row from partial values (missing fields = zero). */
export function dailyComponents(
  localDate: string,
  values: Partial<Record<MoneyComponent, Decimal | string>> & Partial<Record<CountComponent, number>> = {},
): DailyComponents {
  const row: Record<string, string | number> = { localDate };
  for (const k of MONEY_COMPONENTS) {
    const v = values[k];
    row[k] = toMoneyString(v === undefined ? ZERO : dec(v));
  }
  for (const k of COUNT_COMPONENTS) row[k] = values[k] ?? 0;
  return row as DailyComponents;
}
