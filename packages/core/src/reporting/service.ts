import {
  addTotals,
  customerAnalytics,
  bucketKey,
  comparisonRange,
  profitBridge,
  completeness,
  computeMetrics,
  dec,
  defaultGranularity,
  METRIC_KEYS,
  METRICS,
  relativeChange,
  sumComponents,
  todayIn,
  toMoneyString,
  type ComparisonMode,
  type ComponentTotals,
  type DailyComponents,
  type DateRange,
  Decimal,
  type Granularity,
  type LocalDate,
  type MetricKey,
} from "@profitlens/finance";
import type { AdChannelSpend, ReportingDataSource, StoreSummary } from "./types";

const s = (d: Decimal | null): string | null => (d === null ? null : toMoneyString(d));

export interface KpiValue {
  readonly value: string | null;
  readonly previous: string | null;
  /** Relative change vs comparison period (0.12 = +12 %); null when not comparable. */
  readonly change: string | null;
}

export interface SeriesPoint {
  readonly bucket: string; // first local date of the bucket
  readonly revenue: string;
  readonly totalCosts: string;
  readonly netProfit: string;
  readonly netMargin: string | null;
  readonly orders: number;
  readonly adSpend: string;
  /** The bucket contains today (store timezone), so it is still filling in. */
  readonly partial: boolean;
}

export interface DashboardPayload {
  readonly store: StoreSummary;
  readonly range: DateRange;
  readonly comparison: DateRange | null;
  readonly granularity: Granularity;
  readonly kpis: Record<MetricKey, KpiValue>;
  readonly completeness: {
    readonly complete: boolean;
    readonly ordersMissingCogs: number;
    readonly revenueMissingCogsShare: string | null;
    readonly ordersMissingShipping: number;
    readonly transactionsMissingFees: number;
    readonly fxIssues: number;
  };
  readonly series: readonly SeriesPoint[];
  readonly costBreakdown: readonly { readonly key: string; readonly label: string; readonly amount: string }[];
  readonly adChannels: readonly AdChannelSpend[];
  /** What changed net profit vs the comparison period (null without a comparison). */
  readonly bridge: {
    readonly start: string;
    readonly end: string;
    readonly steps: readonly { readonly key: string; readonly label: string; readonly effect: string; readonly description: string }[];
  } | null;
  readonly generatedAt: string;
}

/** Customer analytics (Customers page). Money as decimal strings; ratios as fractions; every figure observed, not predicted. */
export interface CustomerReport {
  readonly store: StoreSummary;
  readonly range: DateRange;
  readonly history: { readonly start: LocalDate | null; readonly complete: boolean };
  readonly period: {
    readonly customers: number;
    readonly newCustomers: number;
    readonly returningCustomers: number;
    readonly returningRate: string | null;
    readonly orders: number;
    readonly ordersPerCustomer: string | null;
    readonly revenueNew: string;
    readonly revenueReturning: string;
    readonly revenueGuests: string;
    readonly guestOrders: number;
    /** Ad spend in the range (all channels). */
    readonly adSpend: string;
    /** Blended CAC: ad spend ÷ new customers in the range (the dashboard's CAC). */
    readonly cac: string | null;
  };
  readonly toDate: {
    readonly customers: number;
    readonly repeatCustomers: number;
    readonly repeatRate: string | null;
    readonly ordersPerCustomer: string | null;
    readonly revenuePerCustomer: string | null;
    readonly grossProfitPerCustomer: string | null;
    /** Share of revenue to date whose products have no cost: gross-profit LTV is overstated by their COGS. */
    readonly revenueMissingCogsShare: string | null;
    /** Gross-profit LTV ÷ blended CAC of the range. */
    readonly ltvToCac: string | null;
  };
  readonly cohorts: readonly {
    readonly month: string;
    readonly customers: number;
    readonly revenueMissingCogs: string;
    readonly cells: readonly {
      readonly offset: number;
      readonly activeCustomers: number;
      readonly retention: string;
      readonly cumulativeRevenuePerCustomer: string;
      readonly cumulativeGrossProfitPerCustomer: string;
      readonly partial: boolean;
    }[];
  }[];
}

function bucketize(days: readonly DailyComponents[], granularity: Granularity): Map<string, DailyComponents[]> {
  const out = new Map<string, DailyComponents[]>();
  for (const d of days) {
    const k = bucketKey(d.localDate, granularity);
    const list = out.get(k);
    if (list) list.push(d);
    else out.set(k, [d]);
  }
  return out;
}

const COST_BREAKDOWN: readonly { key: string; label: string; pick: (t: ComponentTotals) => Decimal }[] = [
  { key: "cogs", label: "COGS", pick: (t) => t.cogs },
  { key: "adSpend", label: "Ad spend", pick: (t) => t.adSpend },
  { key: "shippingCost", label: "Shipping", pick: (t) => t.shippingCost },
  { key: "transactionFees", label: "Transaction fees", pick: (t) => t.transactionFees },
  { key: "fixedExpenses", label: "Fixed expenses", pick: (t) => t.fixedExpenses },
  { key: "variableExpenses", label: "Per-order expenses", pick: (t) => t.variableExpenses.plus(t.adLinkedExpenses) },
  { key: "handlingCost", label: "Handling", pick: (t) => t.handlingCost },
  { key: "chargebacks", label: "Chargebacks", pick: (t) => t.chargebackLoss.plus(t.chargebackFees) },
];

export class ReportingService {
  constructor(private readonly source: ReportingDataSource) {}

  async dashboard(storeId: string, range: DateRange, comparisonMode: ComparisonMode, granularity?: Granularity): Promise<DashboardPayload | null> {
    const store = await this.source.getStore(storeId);
    if (!store) return null;
    const comparison = comparisonRange(range, comparisonMode);
    const [days, prevDays, adChannels] = await Promise.all([
      this.source.getDailyComponents(storeId, range),
      comparison ? this.source.getDailyComponents(storeId, comparison) : Promise.resolve([]),
      this.source.getAdSpendByChannel(storeId, range),
    ]);
    const totals = sumComponents(days);
    const prevTotals = comparison ? sumComponents(prevDays) : null;
    const current = computeMetrics(totals);
    const previous = prevTotals ? computeMetrics(prevTotals) : null;
    const b = prevTotals ? profitBridge(totals, prevTotals) : null;

    const kpis = {} as Record<MetricKey, KpiValue>;
    for (const k of METRIC_KEYS) {
      const cur = current[k];
      const prev = previous ? previous[k] : null;
      kpis[k] = {
        value: s(cur),
        previous: s(prev),
        change: cur !== null && prev !== null ? s(relativeChange(cur, prev)) : null,
      };
    }

    const g = granularity ?? defaultGranularity(range);
    const today = todayIn(store.timezone);
    const series: SeriesPoint[] = [];
    for (const [bucket, rows] of bucketize(days, g)) {
      const t = sumComponents(rows);
      const mm = computeMetrics(t, ["revenue", "totalCosts", "netProfit", "netMargin", "adSpend"]);
      series.push({
        bucket,
        revenue: toMoneyString(mm.revenue!),
        totalCosts: toMoneyString(mm.totalCosts!),
        netProfit: toMoneyString(mm.netProfit!),
        netMargin: s(mm.netMargin),
        orders: t.ordersCount,
        adSpend: toMoneyString(mm.adSpend!),
        partial: rows.some((r) => r.localDate === today),
      });
    }

    const c = completeness(totals);
    return {
      store,
      range,
      comparison,
      granularity: g,
      kpis,
      completeness: {
        complete: c.complete,
        ordersMissingCogs: c.ordersMissingCogs,
        revenueMissingCogsShare: s(c.revenueMissingCogsShare),
        ordersMissingShipping: c.ordersMissingShipping,
        transactionsMissingFees: c.transactionsMissingFees,
        fxIssues: c.fxIssues,
      },
      series,
      costBreakdown: COST_BREAKDOWN.map((b) => ({ key: b.key, label: b.label, amount: toMoneyString(b.pick(totals)) }))
        .filter((b) => !dec(b.amount).isZero())
        .sort((a, b) => dec(b.amount).comparedTo(dec(a.amount))),
      adChannels,
      bridge: b
        ? { start: toMoneyString(b.start), end: toMoneyString(b.end), steps: b.steps.map((x) => ({ key: x.key, label: x.label, effect: toMoneyString(x.effect), description: x.description })) }
        : null,
      generatedAt: new Date().toISOString(),
    };
  }

  async customers(storeId: string, range: DateRange, cohortMonths = 12): Promise<CustomerReport | null> {
    const store = await this.source.getStore(storeId);
    if (!store) return null;
    const [activity, days] = await Promise.all([this.source.getCustomerActivity(storeId, range.end), this.source.getDailyComponents(storeId, range)]);
    const a = customerAnalytics(activity.rows, range, cohortMonths);
    const totals = sumComponents(days);
    const cac = METRICS.cac.compute({ ...totals, newCustomers: a.period.newCustomers });
    const t = a.toDate;
    return {
      store,
      range,
      history: { start: activity.historyStart, complete: activity.historyComplete },
      period: {
        ...a.period,
        returningRate: s(a.period.returningRate),
        ordersPerCustomer: s(a.period.ordersPerCustomer),
        revenueNew: toMoneyString(a.period.revenueNew),
        revenueReturning: toMoneyString(a.period.revenueReturning),
        revenueGuests: toMoneyString(a.period.revenueGuests),
        adSpend: toMoneyString(totals.adSpend),
        cac: s(cac),
      },
      toDate: {
        customers: t.customers,
        repeatCustomers: t.repeatCustomers,
        repeatRate: s(t.repeatRate),
        ordersPerCustomer: s(t.ordersPerCustomer),
        revenuePerCustomer: s(t.revenuePerCustomer),
        grossProfitPerCustomer: s(t.grossProfitPerCustomer),
        revenueMissingCogsShare: s(t.revenue.isZero() ? null : t.revenueMissingCogs.div(t.revenue)),
        ltvToCac: s(t.grossProfitPerCustomer && cac && !cac.isZero() ? t.grossProfitPerCustomer.div(cac) : null),
      },
      cohorts: a.cohorts.map((c) => ({
        month: c.month,
        customers: c.customers,
        revenueMissingCogs: toMoneyString(c.revenueMissingCogs),
        cells: c.cells.map((x) => ({
          offset: x.offset,
          activeCustomers: x.activeCustomers,
          retention: toMoneyString(new Decimal(x.activeCustomers).div(c.customers)),
          cumulativeRevenuePerCustomer: toMoneyString(x.cumulativeRevenuePerCustomer),
          cumulativeGrossProfitPerCustomer: toMoneyString(x.cumulativeGrossProfitPerCustomer),
          partial: x.partial,
        })),
      })),
    };
  }

  /**
   * P&L side by side for several stores (each over the range in its own time zone, FINANCIAL_MODEL §1), plus a
   * consolidated total column when the stores share a currency. Demo stores must not be mixed in (callers check).
   */
  async storeComparison(stores: readonly { storeId: string; range: DateRange }[]): Promise<StoreComparisonReport | null> {
    const loaded = await Promise.all(
      stores.map(async ({ storeId, range }) => {
        const store = await this.source.getStore(storeId);
        return store ? { store, range, totals: sumComponents(await this.source.getDailyComponents(storeId, range)) } : null;
      }),
    );
    if (loaded.some((x) => x === null) || loaded.length === 0) return null;
    const list = loaded as NonNullable<(typeof loaded)[number]>[];
    const currencies = new Set(list.map((x) => x.store.currency));
    const sameCurrency = currencies.size === 1;
    const all = sameCurrency ? addTotals(list.map((x) => x.totals)) : null;
    return {
      stores: list.map((x) => ({ ...x.store, range: x.range })),
      rows: PNL_LINES.map((line) => ({
        key: line.key,
        label: line.label,
        kind: line.kind,
        ...(line.metric ? { metric: line.metric } : {}),
        values: list.map((x) => s(line.value(x.totals))),
        total: all ? s(line.value(all)) : null,
      })),
      consolidated: sameCurrency
        ? { currency: [...currencies][0]! }
        : { currency: null, reason: `Stores report in different currencies (${[...currencies].join(", ")}); a consolidated total needs exchange rates, which are not available yet.` },
      basis: "management",
    };
  }

  async profitAndLoss(storeId: string, range: DateRange, granularity: Granularity): Promise<PnlReport | null> {
    const store = await this.source.getStore(storeId);
    if (!store) return null;
    const days = await this.source.getDailyComponents(storeId, range);
    const buckets = [...bucketize(days, granularity)].map(([key, rows]) => {
      const end = rows[rows.length - 1]!.localDate;
      return { key, range: { start: rows[0]!.localDate, end }, totals: sumComponents(rows) };
    });
    const channelsByBucket = await Promise.all(buckets.map((b) => this.source.getAdSpendByChannel(storeId, b.range)));
    const totalChannels = await this.source.getAdSpendByChannel(storeId, range);
    const all = sumComponents(days);

    const rows: PnlRow[] = PNL_LINES.map((line) => ({
      key: line.key,
      label: line.label,
      kind: line.kind,
      ...(line.metric ? { metric: line.metric } : {}),
      values: buckets.map((b) => s(line.value(b.totals))),
      total: s(line.value(all)),
      children:
        line.key === "adSpend"
          ? totalChannels.map((ch, i) => ({
              key: `adSpend.${ch.channel}`,
              label: ch.label,
              kind: "cost" as const,
              values: channelsByBucket.map((list) => list[i]?.spend ?? "0.000000"),
              total: ch.spend,
              children: [],
            }))
          : [],
    }));

    return {
      store,
      range,
      granularity,
      columns: buckets.map((b) => ({ key: b.key, start: b.range.start, end: b.range.end })),
      rows,
      basis: "management",
    };
  }
}

export interface StoreComparisonReport {
  readonly stores: readonly (StoreSummary & { readonly range: DateRange })[];
  readonly rows: readonly Omit<PnlRow, "children">[];
  /** Consolidated column: only when every store reports in the same currency (no FX conversion yet, B2). */
  readonly consolidated: { readonly currency: string } | { readonly currency: null; readonly reason: string };
  readonly basis: "management";
}

export interface PnlRow {
  readonly key: string;
  readonly label: string;
  /** revenue / cost lines, subtotals, ratio rows, and memo (non-P&L) lines. */
  readonly kind: "revenue" | "cost" | "subtotal" | "ratio" | "memo";
  readonly metric?: MetricKey;
  readonly values: readonly (string | null)[];
  readonly total: string | null;
  readonly children: readonly PnlRow[];
}

export interface PnlReport {
  readonly store: StoreSummary;
  readonly range: DateRange;
  readonly granularity: Granularity;
  readonly columns: readonly { readonly key: string; readonly start: string; readonly end: string }[];
  readonly rows: readonly PnlRow[];
  /** Always "management": an operational estimate, not a statutory accounting statement. */
  readonly basis: "management";
}

const metric = (k: MetricKey) => (t: ComponentTotals) => METRICS[k].compute(t);

const PNL_LINES: readonly { key: string; label: string; kind: PnlRow["kind"]; metric?: MetricKey; value: (t: ComponentTotals) => Decimal | null }[] = [
  { key: "grossSales", label: "Gross sales", kind: "revenue", metric: "grossSales", value: metric("grossSales") },
  { key: "discounts", label: "Discounts", kind: "cost", metric: "discounts", value: metric("discounts") },
  { key: "returns", label: "Returns", kind: "cost", metric: "returns", value: metric("returns") },
  { key: "netSales", label: "Net sales", kind: "subtotal", metric: "netSales", value: metric("netSales") },
  { key: "shippingCharged", label: "Shipping charged", kind: "revenue", metric: "shippingCharged", value: metric("shippingCharged") },
  { key: "tips", label: "Tips", kind: "revenue", value: (t) => t.tips },
  { key: "revenue", label: "Revenue", kind: "subtotal", metric: "revenue", value: metric("revenue") },
  { key: "cogs", label: "COGS", kind: "cost", metric: "cogs", value: metric("cogs") },
  { key: "shippingCost", label: "Shipping costs", kind: "cost", metric: "shippingCost", value: metric("shippingCost") },
  { key: "handlingCost", label: "Handling", kind: "cost", metric: "handlingCost", value: metric("handlingCost") },
  { key: "transactionFees", label: "Transaction fees", kind: "cost", metric: "transactionFees", value: metric("transactionFees") },
  { key: "chargebacks", label: "Chargebacks", kind: "cost", metric: "chargebacks", value: metric("chargebacks") },
  { key: "variableExpenses", label: "Per-order & % expenses", kind: "cost", value: (t) => t.variableExpenses },
  { key: "contributionBeforeAds", label: "Contribution before ads", kind: "subtotal", metric: "contributionBeforeAds", value: metric("contributionBeforeAds") },
  { key: "adSpend", label: "Ad spend", kind: "cost", metric: "adSpend", value: metric("adSpend") },
  { key: "adLinkedExpenses", label: "Ad-linked expenses", kind: "cost", value: (t) => t.adLinkedExpenses },
  { key: "contributionAfterAds", label: "Contribution after ads", kind: "subtotal", metric: "contributionAfterAds", value: metric("contributionAfterAds") },
  { key: "fixedExpenses", label: "Fixed expenses", kind: "cost", value: (t) => t.fixedExpenses },
  { key: "netProfit", label: "Net profit", kind: "subtotal", metric: "netProfit", value: metric("netProfit") },
  { key: "netMargin", label: "Net margin", kind: "ratio", metric: "netMargin", value: metric("netMargin") },
  { key: "taxes", label: "Taxes collected (liability)", kind: "memo", metric: "taxes", value: metric("taxes") },
  { key: "giftCardSales", label: "Gift card sales (deferred)", kind: "memo", value: (t) => t.giftCardSales },
];
