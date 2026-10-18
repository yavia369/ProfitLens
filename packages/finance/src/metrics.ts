import type { ComponentTotals } from "./components";
import { Decimal, ratio } from "./money";

export type MetricFormat = "currency" | "percent" | "ratio" | "count";
/** Whether an increase is good, bad or neither — drives delta colouring. */
export type MetricPolarity = "higher_is_better" | "lower_is_better" | "neutral";

export interface MetricDefinition {
  readonly key: MetricKey;
  readonly label: string;
  readonly format: MetricFormat;
  readonly polarity: MetricPolarity;
  /** Plain-language formula shown in the "How is this calculated?" popover. */
  readonly formula: string;
  readonly description: string;
  /** Costs are displayed as deductions (accounting parentheses). */
  readonly isCost?: boolean;
  compute(t: ComponentTotals): Decimal | null;
}

// Intermediate aggregates (FINANCIAL_MODEL §6).
const netProductSales = (t: ComponentTotals) => t.grossSales.minus(t.discounts).minus(t.returns);
const fulfilment = (t: ComponentTotals) => t.shippingCost.plus(t.handlingCost);
const chargebacks = (t: ComponentTotals) => t.chargebackLoss.plus(t.chargebackFees);
const variableCosts = (t: ComponentTotals) =>
  t.cogs.plus(fulfilment(t)).plus(t.transactionFees).plus(chargebacks(t)).plus(t.variableExpenses);
const contributionBeforeAds = (t: ComponentTotals) => t.revenue.minus(variableCosts(t));
const contributionAfterAds = (t: ComponentTotals) => contributionBeforeAds(t).minus(t.adSpend).minus(t.adLinkedExpenses);
const netProfit = (t: ComponentTotals) => contributionAfterAds(t).minus(t.fixedExpenses);
const totalCosts = (t: ComponentTotals) => variableCosts(t).plus(t.adSpend).plus(t.adLinkedExpenses).plus(t.fixedExpenses);
const orders = (t: ComponentTotals) => new Decimal(t.ordersCount);

const defs = [
  { key: "netProfit", label: "Net profit", format: "currency", polarity: "higher_is_better",
    formula: "Contribution after ads − fixed expenses",
    description: "Management estimate of profit after all recognised costs.", compute: netProfit },
  { key: "netMargin", label: "Net margin", format: "percent", polarity: "higher_is_better",
    formula: "Net profit ÷ revenue", description: "Share of revenue kept as net profit.",
    compute: (t) => ratio(netProfit(t), t.revenue) },
  { key: "revenue", label: "Revenue", format: "currency", polarity: "higher_is_better",
    formula: "Net product sales + shipping charged + tips + adjustments (taxes, duties and gift-card sales excluded)",
    description: "Recognised revenue under the store's calculation policy.", compute: (t) => t.revenue },
  { key: "grossSales", label: "Gross sales", format: "currency", polarity: "higher_is_better",
    formula: "Product sales before discounts and returns, excluding tax", description: "", compute: (t) => t.grossSales },
  { key: "discounts", label: "Discounts", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Discounts allocated to product sales (before tax)", description: "", compute: (t) => t.discounts },
  { key: "returns", label: "Returns", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Net value of returned / removed product sales, dated when they happened", description: "", compute: (t) => t.returns },
  { key: "netSales", label: "Net sales", format: "currency", polarity: "higher_is_better",
    formula: "Gross sales − discounts − returns", description: "", compute: netProductSales },
  { key: "shippingCharged", label: "Shipping charged", format: "currency", polarity: "higher_is_better",
    formula: "Shipping paid by customers, net of shipping refunds", description: "", compute: (t) => t.shippingCharged },
  { key: "taxes", label: "Taxes collected", format: "currency", polarity: "neutral",
    formula: "Tax collected on all sales (a liability, not revenue)", description: "", compute: (t) => t.taxes },
  { key: "ordersCount", label: "Orders", format: "count", polarity: "higher_is_better",
    formula: "Orders placed in the period", description: "", compute: (t) => orders(t) },
  { key: "unitsSold", label: "Units sold", format: "count", polarity: "higher_is_better",
    formula: "Units ordered − units returned", description: "", compute: (t) => new Decimal(t.unitsSold) },
  { key: "aov", label: "Average order value", format: "currency", polarity: "higher_is_better",
    formula: "Revenue ÷ orders", description: "", compute: (t) => ratio(t.revenue, orders(t)) },
  { key: "cogs", label: "COGS", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Units × landed unit cost effective on the order date, net of restocked returns", description: "", compute: (t) => t.cogs },
  { key: "grossProfit", label: "Gross profit", format: "currency", polarity: "higher_is_better",
    formula: "Revenue − COGS", description: "", compute: (t) => t.revenue.minus(t.cogs) },
  { key: "grossMargin", label: "Gross margin", format: "percent", polarity: "higher_is_better",
    formula: "Gross profit ÷ revenue", description: "", compute: (t) => ratio(t.revenue.minus(t.cogs), t.revenue) },
  { key: "shippingCost", label: "Shipping costs", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Carrier/fulfilment cost paid by the store (actual, override or rule)", description: "", compute: (t) => t.shippingCost },
  { key: "handlingCost", label: "Handling", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Handling rules or per-unit handling in landed cost", description: "", compute: (t) => t.handlingCost },
  { key: "transactionFees", label: "Transaction fees", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Actual Shopify Payments fees, else gateway rules + Shopify third-party fee", description: "", compute: (t) => t.transactionFees },
  { key: "chargebacks", label: "Chargebacks", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Lost/accepted chargeback amounts + dispute fees", description: "", compute: chargebacks },
  { key: "adSpend", label: "Ad spend", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Daily spend from connected ad accounts + manual entries", description: "", compute: (t) => t.adSpend },
  { key: "customExpenses", label: "Custom expenses", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Fixed + per-order + percentage expenses", description: "",
    compute: (t) => t.fixedExpenses.plus(t.variableExpenses).plus(t.adLinkedExpenses) },
  { key: "totalCosts", label: "Total costs", format: "currency", polarity: "lower_is_better", isCost: true,
    formula: "Variable costs + ad spend + fixed expenses", description: "", compute: totalCosts },
  { key: "contributionBeforeAds", label: "Contribution (before ads)", format: "currency", polarity: "higher_is_better",
    formula: "Revenue − COGS − fulfilment − fees − chargebacks − variable expenses", description: "", compute: contributionBeforeAds },
  { key: "contributionMargin", label: "Contribution margin", format: "percent", polarity: "higher_is_better",
    formula: "Contribution before ads ÷ revenue", description: "", compute: (t) => ratio(contributionBeforeAds(t), t.revenue) },
  { key: "contributionAfterAds", label: "Contribution (after ads)", format: "currency", polarity: "higher_is_better",
    formula: "Contribution before ads − ad spend − ad-linked expenses", description: "", compute: contributionAfterAds },
  { key: "roas", label: "ROAS (blended)", format: "ratio", polarity: "higher_is_better",
    formula: "Revenue ÷ ad spend", description: "Store-level, not platform-reported.", compute: (t) => ratio(t.revenue, t.adSpend) },
  { key: "mer", label: "MER", format: "ratio", polarity: "higher_is_better",
    formula: "Revenue ÷ (ad spend + marketing expenses)", description: "",
    compute: (t) => ratio(t.revenue, t.adSpend.plus(t.marketingExpenses)) },
  { key: "breakEvenRoas", label: "Break-even ROAS", format: "ratio", polarity: "lower_is_better",
    formula: "Revenue ÷ contribution before ads (ROAS at which contribution after ads is zero)", description: "",
    compute: (t) => {
      const cp = contributionBeforeAds(t);
      return cp.lte(0) ? null : ratio(t.revenue, cp);
    } },
  { key: "breakEvenCpa", label: "Break-even CPA", format: "currency", polarity: "higher_is_better",
    formula: "Contribution before ads ÷ orders", description: "", compute: (t) => ratio(contributionBeforeAds(t), orders(t)) },
  { key: "cpa", label: "CPA (blended)", format: "currency", polarity: "lower_is_better",
    formula: "Ad spend ÷ orders", description: "", compute: (t) => ratio(t.adSpend, orders(t)) },
  { key: "cac", label: "CAC (blended)", format: "currency", polarity: "lower_is_better",
    formula: "Ad spend ÷ new customers", description: "Observed; all ad spend attributed to new customers.",
    compute: (t) => ratio(t.adSpend, new Decimal(t.newCustomers)) },
  { key: "costPerOrder", label: "Cost per order", format: "currency", polarity: "lower_is_better",
    formula: "Total costs ÷ orders", description: "", compute: (t) => ratio(totalCosts(t), orders(t)) },
  { key: "profitPerOrder", label: "Profit per order", format: "currency", polarity: "higher_is_better",
    formula: "Net profit ÷ orders", description: "", compute: (t) => ratio(netProfit(t), orders(t)) },
  { key: "refundRate", label: "Refund rate", format: "percent", polarity: "lower_is_better",
    formula: "Returns ÷ gross sales", description: "", compute: (t) => ratio(t.returns, t.grossSales) },
] as const satisfies readonly (Omit<MetricDefinition, "key"> & { key: string })[];

export type MetricKey = (typeof defs)[number]["key"];

export const METRICS: Readonly<Record<MetricKey, MetricDefinition>> = Object.fromEntries(
  defs.map((d) => [d.key, d as MetricDefinition]),
) as Record<MetricKey, MetricDefinition>;

export const METRIC_KEYS = defs.map((d) => d.key) as MetricKey[];

export function isMetricKey(value: string): value is MetricKey {
  return value in METRICS;
}

export function computeMetrics(totals: ComponentTotals, keys: readonly MetricKey[] = METRIC_KEYS): Record<MetricKey, Decimal | null> {
  const out = {} as Record<MetricKey, Decimal | null>;
  for (const k of keys) out[k] = METRICS[k].compute(totals);
  return out;
}

/** Data-completeness summary for a period (FINANCIAL_MODEL principle 4). */
export interface Completeness {
  readonly complete: boolean;
  readonly ordersMissingCogs: number;
  readonly revenueMissingCogsShare: Decimal | null;
  readonly ordersMissingShipping: number;
  readonly transactionsMissingFees: number;
  readonly feesEstimatedAmount: Decimal;
  readonly fxIssues: number;
  readonly unclassifiedSalesAmount: Decimal;
}

export function completeness(t: ComponentTotals): Completeness {
  const complete =
    t.ordersMissingCogs === 0 &&
    t.ordersMissingShipping === 0 &&
    t.transactionsMissingFees === 0 &&
    t.fxIssues === 0 &&
    t.unclassifiedSalesAmount.isZero();
  return {
    complete,
    ordersMissingCogs: t.ordersMissingCogs,
    revenueMissingCogsShare: ratio(t.revenueMissingCogs, t.revenue),
    ordersMissingShipping: t.ordersMissingShipping,
    transactionsMissingFees: t.transactionsMissingFees,
    feesEstimatedAmount: t.feesEstimatedAmount,
    fxIssues: t.fxIssues,
    unclassifiedSalesAmount: t.unclassifiedSalesAmount,
  };
}
