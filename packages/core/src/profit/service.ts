import { createHash } from "node:crypto";
import { computeOrderProfit, ENGINE_VERSION, toMoneyString, type FinancialPolicy, type OrderProfitResult } from "@profitlens/finance";
import { schema, type Database } from "@profitlens/db";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { loadOrderInputs, loadStoreContext, type StoreCalcContext } from "./load";
import { loadActivePolicy } from "./policy";

const BATCH = 200;

export interface AmountMismatch {
  readonly date: string;
  readonly metric: string;
  readonly expected: string;
  readonly actual: string;
  /** expected − actual */
  readonly difference: string;
}

export interface RecalcStats {
  /** Orders whose result was (re)written. */
  computed: number;
  /** Orders skipped because nothing they depend on changed (same inputs hash). */
  unchanged: number;
  /** Store-local days re-aggregated into daily_store_metrics. */
  daysAggregated: number;
}

/** Canonical hash of everything a result depends on (FINANCIAL_MODEL §8 `inputsHash`). */
export function inputsHash(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/**
 * Applies the finance engine to stored Shopify facts: order results with traces, per-day contributions and
 * COGS lines, then the per-day store aggregate. Idempotent: an order is rewritten only when its inputs hash
 * changes (or when forced), and aggregation is a pure function of the per-order rows.
 */
export class ProfitService {
  constructor(private readonly db: Database) {}

  /** Recalculates specific orders (after a sync, a webhook or a cost change) and re-aggregates their days. */
  async recalcOrders(storeId: string, orderIds: readonly string[], opts: { force?: boolean } = {}): Promise<RecalcStats> {
    const stats: RecalcStats = { computed: 0, unchanged: 0, daysAggregated: 0 };
    if (orderIds.length === 0) return stats;
    const store = await loadStoreContext(this.db, storeId);
    const { version, policy } = await loadActivePolicy(this.db, storeId);
    const dirty = new Set<string>();
    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batch = orderIds.slice(i, i + BATCH);
      for (const d of await this.recalcBatch(store, policy, version, batch, opts.force ?? false, stats)) dirty.add(d);
    }
    stats.daysAggregated = await this.aggregateDays(storeId, [...dirty]);
    return stats;
  }

  /** Recalculates every order of a store (policy change, engine upgrade, backfill) and rebuilds all days. */
  async recalcStore(storeId: string, opts: { force?: boolean } = {}): Promise<RecalcStats> {
    const stats: RecalcStats = { computed: 0, unchanged: 0, daysAggregated: 0 };
    const store = await loadStoreContext(this.db, storeId);
    const { version, policy } = await loadActivePolicy(this.db, storeId);
    for (let after = ""; ; ) {
      const ids = (
        await this.db
          .select({ id: schema.order.id })
          .from(schema.order)
          .where(and(eq(schema.order.storeId, storeId), gt(schema.order.id, after || "00000000-0000-0000-0000-000000000000")))
          .orderBy(asc(schema.order.id))
          .limit(BATCH)
      ).map((r) => r.id);
      if (ids.length === 0) break;
      await this.recalcBatch(store, policy, version, ids, opts.force ?? false, stats);
      after = ids[ids.length - 1]!;
    }
    stats.daysAggregated = await this.rebuildAllDays(storeId);
    return stats;
  }

  async orderCount(storeId: string): Promise<number> {
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(schema.order).where(eq(schema.order.storeId, storeId));
    return r?.n ?? 0;
  }

  /** Orders that contain any of the variants with an order date on/after `fromDate` (cost version changes). */
  async ordersWithVariants(storeId: string, variantIds: readonly string[], fromDate: string): Promise<string[]> {
    if (variantIds.length === 0) return [];
    const rows = await this.db
      .selectDistinct({ id: schema.order.id })
      .from(schema.orderLineItem)
      .innerJoin(schema.order, eq(schema.order.id, schema.orderLineItem.orderId))
      .where(and(eq(schema.order.storeId, storeId), inArray(schema.orderLineItem.variantId, [...variantIds]), sql`${schema.order.processedLocalDate} >= ${fromDate}`));
    return rows.map((r) => r.id);
  }

  /** Orders with an order date in [from, to) (rule changes); `to` null = open-ended. */
  async ordersInRange(storeId: string, from: string, to: string | null): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.order.id })
      .from(schema.order)
      .where(and(eq(schema.order.storeId, storeId), sql`${schema.order.processedLocalDate} >= ${from}`, to ? sql`${schema.order.processedLocalDate} < ${to}` : sql`true`));
    return rows.map((r) => r.id);
  }

  private async recalcBatch(store: StoreCalcContext, policy: FinancialPolicy, policyVersion: number, ids: readonly string[], force: boolean, stats: RecalcStats): Promise<Set<string>> {
    const dirty = new Set<string>();
    const loaded = await loadOrderInputs(this.db, store, ids);
    const existing = new Map(
      (await this.db.select({ orderId: schema.orderProfit.orderId, hash: schema.orderProfit.inputsHash }).from(schema.orderProfit).where(inArray(schema.orderProfit.orderId, [...ids]))).map((r) => [r.orderId, r.hash]),
    );
    for (const { input, ctx } of loaded) {
      const hash = inputsHash({ engine: ENGINE_VERSION, policyVersion, policy, input, ctx });
      if (!force && existing.get(input.id) === hash) {
        stats.unchanged += 1;
        continue;
      }
      const result = computeOrderProfit(input, ctx, policy);
      for (const d of await this.writeResult(store.storeId, result, policyVersion, hash)) dirty.add(d);
      stats.computed += 1;
    }
    return dirty;
  }

  /** Replaces one order's stored result; returns the days whose aggregate changed (old and new). */
  private async writeResult(storeId: string, r: OrderProfitResult, policyVersion: number, hash: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const old = await tx.select({ d: schema.orderDailyResult.localDate }).from(schema.orderDailyResult).where(eq(schema.orderDailyResult.orderId, r.orderId));
      await tx.delete(schema.orderDailyResult).where(eq(schema.orderDailyResult.orderId, r.orderId));
      await tx.delete(schema.orderCogsLine).where(eq(schema.orderCogsLine.orderId, r.orderId));
      const m = toMoneyString;
      const t = r.totals;
      const values = {
        storeId,
        revenue: m(t.revenue),
        cogs: m(t.cogs),
        shippingCost: m(t.shippingCost),
        handlingCost: m(t.handlingCost),
        transactionFees: m(t.transactionFees),
        chargebacks: m(t.chargebackLoss.plus(t.chargebackFees)),
        contributionBeforeAds: m(r.contributionBeforeAds),
        profit: m(r.contributionBeforeAds),
        isComplete: r.completeness.complete,
        included: r.included,
        exclusionReason: r.exclusionReason,
        missingComponents: [...r.completeness.missing],
        estimatedComponents: [...r.completeness.estimated],
        trace: r.trace,
        engineVersion: ENGINE_VERSION,
        policyVersion,
        inputsHash: hash,
        computedAt: new Date(),
      };
      await tx
        .insert(schema.orderProfit)
        .values({ orderId: r.orderId, ...values })
        .onConflictDoUpdate({ target: schema.orderProfit.orderId, set: values });
      if (r.days.length) {
        await tx.insert(schema.orderDailyResult).values(
          r.days.map(({ localDate, parts: p }) => ({
            storeId,
            orderId: r.orderId,
            localDate,
            ordersCount: p.ordersCount,
            unitsSold: p.unitsSold,
            grossSales: m(p.grossSales),
            discounts: m(p.discounts),
            returns: m(p.returns),
            shippingCharged: m(p.shippingCharged),
            tips: m(p.tips),
            adjustments: m(p.adjustments),
            dutiesAndFees: m(p.dutiesAndFees),
            taxes: m(p.taxes),
            giftCardSales: m(p.giftCardSales),
            revenue: m(p.revenue),
            cogs: m(p.cogs),
            shippingCost: m(p.shippingCost),
            handlingCost: m(p.handlingCost),
            transactionFees: m(p.transactionFees),
            chargebackLoss: m(p.chargebackLoss),
            chargebackFees: m(p.chargebackFees),
            ordersMissingCogs: p.ordersMissingCogs,
            revenueMissingCogs: m(p.revenueMissingCogs),
            ordersMissingShipping: p.ordersMissingShipping,
            feesEstimatedAmount: m(p.feesEstimatedAmount),
            transactionsMissingFees: p.transactionsMissingFees,
            unclassifiedSalesAmount: m(p.unclassifiedSalesAmount),
          })),
        );
      }
      if (r.cogsLines.length) {
        await tx.insert(schema.orderCogsLine).values(
          r.cogsLines.map((l) => ({
            storeId,
            orderId: r.orderId,
            localDate: l.localDate,
            lineItemGid: l.lineItemGid,
            variantId: l.variantId,
            kind: l.kind,
            quantity: l.quantity,
            unitCost: l.unitCost ? m(l.unitCost) : null,
            amount: m(l.amount),
            status: l.status,
            costVersionId: l.costVersionId,
          })),
        );
      }
      return [...new Set([...old.map((o) => o.d), ...r.days.map((d) => d.localDate)])];
    });
  }

  /** Rebuilds daily_store_metrics for the given days from the per-order rows (days with no rows are removed). */
  async aggregateDays(storeId: string, days: readonly string[]): Promise<number> {
    if (days.length === 0) return 0;
    const list = sql.join(days.map((d) => sql`${d}::date`), sql`, `);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`delete from daily_store_metrics where store_id = ${storeId} and local_date in (${list})`);
      await tx.execute(sql`${AGGREGATE_INSERT(storeId)} and r.local_date in (${list}) group by r.store_id, r.local_date, s.currency`);
    });
    return days.length;
  }

  /**
   * FINANCIAL_MODEL §10: recomputes gross sales, discounts, returns, shipping and taxes per day straight from the
   * raw sales ledger (independent SQL, not the engine) and compares them with daily_store_metrics. Differences
   * above 0.01 are recorded as reconciliation issues. Skipped when the policy restates refunds onto order dates.
   */
  async reconcileAmounts(storeId: string, from: string, to: string): Promise<AmountMismatch[]> {
    const { policy } = await loadActivePolicy(this.db, storeId);
    if (policy.refundDating !== "event") return [];
    const res = await this.db.execute(sql`
      with ledger as (
        select l.happened_local_date as d,
          sum(case when l.line_type = 'PRODUCT' and (l.action_type = 'ORDER' or (l.action_type = 'UPDATE' and coalesce(l.quantity, 0) > 0))
                   then l.total_amount - l.total_tax_amount + l.total_discount_before_taxes else 0 end) as gross_sales,
          sum(case when l.line_type = 'PRODUCT' and (l.action_type = 'ORDER' or (l.action_type = 'UPDATE' and coalesce(l.quantity, 0) > 0))
                   then l.total_discount_before_taxes else 0 end) as discounts,
          sum(case when l.line_type = 'PRODUCT' and not (l.action_type = 'ORDER' or (l.action_type = 'UPDATE' and coalesce(l.quantity, 0) > 0))
                   then -(l.total_amount - l.total_tax_amount) else 0 end) as returns,
          sum(case when l.line_type = 'SHIPPING' then l.total_amount - l.total_tax_amount else 0 end) as shipping_charged,
          sum(l.total_tax_amount) as taxes
        from sale_ledger_entry l
        join order_profit p on p.order_id = l.order_id and p.included
        where l.store_id = ${storeId} and l.happened_local_date between ${from}::date and ${to}::date
        group by 1
      ),
      agg as (select local_date as d, gross_sales, discounts, returns, shipping_charged, taxes from daily_store_metrics
              where store_id = ${storeId} and local_date between ${from}::date and ${to}::date)
      select coalesce(ledger.d, agg.d)::text as date, m.metric, m.expected::text as expected, m.actual::text as actual,
        (m.expected - m.actual)::text as difference
      from ledger full join agg on agg.d = ledger.d,
      lateral (values
        ('gross_sales', coalesce(ledger.gross_sales, 0), coalesce(agg.gross_sales, 0)),
        ('discounts', coalesce(ledger.discounts, 0), coalesce(agg.discounts, 0)),
        ('returns', coalesce(ledger.returns, 0), coalesce(agg.returns, 0)),
        ('shipping', coalesce(ledger.shipping_charged, 0), coalesce(agg.shipping_charged, 0)),
        ('taxes', coalesce(ledger.taxes, 0), coalesce(agg.taxes, 0))
      ) as m(metric, expected, actual)
      where abs(m.expected - m.actual) > 0.01
      order by 1, 2`);
    const issues = res.rows as unknown as AmountMismatch[];
    if (issues.length) {
      await this.db.insert(schema.reconciliationIssue).values(issues.map(({ date, ...i }) => ({ storeId, localDate: date, ...i })));
    }
    return issues;
  }

  private async rebuildAllDays(storeId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`delete from daily_store_metrics where store_id = ${storeId}`);
      const res = await tx.execute(sql`${AGGREGATE_INSERT(storeId)} group by r.store_id, r.local_date, s.currency`);
      return res.rowCount ?? 0;
    });
  }
}

/** Σ order_daily_result per day (expenses, ad spend and new customers are applied on read; D-034). */
const AGGREGATE_INSERT = (storeId: string) => sql`
  insert into daily_store_metrics (
    store_id, local_date, currency, orders_count, units_sold, gross_sales, discounts, returns, shipping_charged, tips,
    adjustments, duties_and_fees, taxes, gift_card_sales, revenue, cogs, shipping_cost, handling_cost, transaction_fees,
    chargeback_loss, chargeback_fees, orders_missing_cogs, revenue_missing_cogs, orders_missing_shipping,
    fees_estimated_amount, transactions_missing_fees, unclassified_sales_amount, computed_at)
  select r.store_id, r.local_date, s.currency, sum(r.orders_count), sum(r.units_sold), sum(r.gross_sales), sum(r.discounts),
    sum(r.returns), sum(r.shipping_charged), sum(r.tips), sum(r.adjustments), sum(r.duties_and_fees), sum(r.taxes),
    sum(r.gift_card_sales), sum(r.revenue), sum(r.cogs), sum(r.shipping_cost), sum(r.handling_cost), sum(r.transaction_fees),
    sum(r.chargeback_loss), sum(r.chargeback_fees), sum(r.orders_missing_cogs), sum(r.revenue_missing_cogs),
    sum(r.orders_missing_shipping), sum(r.fees_estimated_amount), sum(r.transactions_missing_fees),
    sum(r.unclassified_sales_amount), now()
  from order_daily_result r join store s on s.id = r.store_id
  where r.store_id = ${storeId}`;
