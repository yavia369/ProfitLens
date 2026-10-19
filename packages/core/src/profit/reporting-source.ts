import {
  addDays,
  allocateExpenses,
  dailyComponents,
  dec,
  Decimal,
  eachDay,
  fxLookupFrom,
  toMoneyString,
  worstStatus,
  ZERO,
  type CostStatus as EngineCostStatus,
  type CustomerActivityRow,
  type DailyComponents,
  type DateRange,
  type LocalDate,
  type ExpenseInput,
  type FxLookup,
} from "@profitlens/finance";
import { schema, type Database } from "@profitlens/db";
import { and, asc, between, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type {
  AdChannelSpend,
  BreakdownLine,
  CostStatus,
  CustomerActivity,
  OrderDetail,
  OrderQuery,
  OrderRow,
  ProductRow,
  ReportingDataSource,
  StoreSummary,
} from "../reporting/types";

const m = (d: Decimal) => toMoneyString(d);
const PLATFORM_LABEL: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", tiktok: "TikTok", manual: "Manual entries" };

/** Gross / discount / return amounts of a ledger row (same rules as the engine, FINANCIAL_MODEL §4). */
const ADDS_UNITS = sql`(l.action_type = 'ORDER' or (l.action_type = 'UPDATE' and coalesce(l.quantity, 0) > 0))`;

/**
 * ReportingDataSource for live (Shopify-connected) stores of one organization. Reads per-day aggregates
 * computed by ProfitService and applies store-level items on read: ad spend, custom expenses and new
 * customers (D-034), so editing an expense never requires recalculating orders.
 */
export class DbReportingDataSource implements ReportingDataSource {
  constructor(
    private readonly db: Database,
    private readonly organizationId: string,
  ) {}

  async listStores(): Promise<StoreSummary[]> {
    const rows = await this.db
      .select({ store: schema.store, through: schema.storeConnection.ordersSyncedThrough })
      .from(schema.store)
      .leftJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id))
      .where(and(eq(schema.store.organizationId, this.organizationId), eq(schema.store.isDemo, false), ne(schema.store.status, "uninstalled")))
      .orderBy(asc(schema.store.name));
    return rows.map(({ store, through }) => ({
      id: store.id,
      name: store.name,
      currency: store.currency,
      timezone: store.ianaTimezone,
      isDemo: false,
      lastSyncedAt: through?.toISOString() ?? null,
    }));
  }

  async getStore(storeId: string): Promise<StoreSummary | null> {
    return (await this.listStores()).find((s) => s.id === storeId) ?? null;
  }

  /** Throws unless the store belongs to this organization (defence in depth for every query below). */
  private async store(storeId: string): Promise<StoreSummary> {
    const s = await this.getStore(storeId);
    if (!s) throw new Error("store not accessible");
    return s;
  }

  async getCustomerActivity(storeId: string, end: LocalDate): Promise<CustomerActivity> {
    await this.store(storeId);
    const [res, [conn]] = await Promise.all([
      // order_daily_result only holds orders included by the policy; guest orders group under a null customer.
      this.db.execute(sql`
        select o.customer_id, c.first_order_local_date::text as first_order_date, r.local_date::text as date,
          sum(r.orders_count)::int as orders, sum(r.revenue)::text as revenue, sum(r.cogs)::text as cogs,
          sum(r.revenue_missing_cogs)::text as missing
        from order_daily_result r
        join "order" o on o.id = r.order_id
        left join customer c on c.id = o.customer_id
        where r.store_id = ${storeId} and r.local_date <= ${end}
        group by o.customer_id, c.first_order_local_date, r.local_date`),
      this.db
        .select({ historyStart: schema.storeConnection.historyStart, scopes: schema.storeConnection.grantedScopes })
        .from(schema.storeConnection)
        .where(eq(schema.storeConnection.storeId, storeId)),
    ]);
    type Row = { customer_id: string | null; first_order_date: string | null; date: string; orders: number; revenue: string; cogs: string; missing: string };
    const rows: CustomerActivityRow[] = (res.rows as Row[]).map((r) => ({
      customerId: r.customer_id,
      firstOrderDate: r.first_order_date,
      date: r.date,
      ordersPlaced: r.orders,
      revenue: r.revenue,
      cogs: r.cogs,
      revenueMissingCogs: r.missing,
    }));
    return {
      rows,
      historyStart: conn?.historyStart ?? null,
      // Without read_all_orders Shopify only returns the last 60 days, so earlier customers look new.
      historyComplete: (conn?.scopes ?? "").split(",").map((x) => x.trim()).includes("read_all_orders"),
    };
  }

  private async fxFor(currency: string, currencies: readonly string[], range: DateRange): Promise<FxLookup> {
    const foreign = [...new Set(currencies)].filter((c) => c !== currency);
    const rates: Record<string, Record<string, string>> = {};
    if (foreign.length) {
      const rows = await this.db
        .select()
        .from(schema.fxRate)
        .where(and(inArray(schema.fxRate.base, foreign), eq(schema.fxRate.quote, currency), between(schema.fxRate.date, addDays(range.start, -7), range.end)));
      for (const r of rows) (rates[r.base] ??= {})[r.date] = r.rate;
    }
    return fxLookupFrom(rates, currency);
  }

  /** Daily ad spend per account in store currency. Campaign rows are used when an account has them, else account rows. */
  private async adSpendRows(storeId: string, currency: string, timezone: string, range: DateRange) {
    const rows = await this.db.execute(sql`
      with spend as (
        select a.id as account_id, a.platform, a.currency, a.timezone, d.date::text as date, d.source, d.level,
          sum(d.spend) as spend, sum(d.conversion_value) as value
        from ad_spend_daily d join ad_account a on a.id = d.ad_account_id
        where a.store_id = ${storeId} and a.organization_id = ${this.organizationId} and d.date between ${range.start}::date and ${range.end}::date
          -- Imported data wins over a plain manual entry for the same platform and day; adjustments add on top.
          and not (d.source = 'manual' and not d.is_adjustment and exists (
            select 1 from ad_spend_daily d2 join ad_account a2 on a2.id = d2.ad_account_id
            where a2.store_id = a.store_id and a2.platform = a.platform and d2.source = 'api' and d2.date = d.date))
        group by 1, 2, 3, 4, 5, 6, 7
      ),
      pick as (select account_id, bool_or(level = 'campaign') as has_campaigns from spend group by 1)
      select s.platform, s.currency, s.date, s.source, bool_or(s.timezone <> ${timezone}) as other_tz,
        sum(s.spend)::text as spend, sum(s.value)::text as value
      from spend s join pick p on p.account_id = s.account_id
      where s.level = case when p.has_campaigns then 'campaign'::ad_spend_level else 'account'::ad_spend_level end
      group by 1, 2, 3, 4`);
    const list = rows.rows as { platform: string; currency: string; date: string; source: "api" | "manual"; other_tz: boolean; spend: string; value: string | null }[];
    const fx = await this.fxFor(currency, list.map((r) => r.currency), range);
    return list.map((r) => {
      const rate = fx(r.currency, r.date);
      return { ...r, rate, spendStore: rate ? dec(r.spend).times(rate) : null, valueStore: rate && r.value ? dec(r.value).times(rate) : null };
    });
  }

  private async expenses(storeId: string): Promise<ExpenseInput[]> {
    const rows = await this.db
      .select({ e: schema.expense, isMarketing: schema.expenseCategory.isMarketing })
      .from(schema.expense)
      .leftJoin(schema.expenseCategory, eq(schema.expenseCategory.id, schema.expense.categoryId))
      .where(and(eq(schema.expense.organizationId, this.organizationId), eq(schema.expense.storeId, storeId), isNull(schema.expense.archivedAt)))
      .orderBy(asc(schema.expense.startDate), asc(schema.expense.id));
    return rows.map(({ e, isMarketing }) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      frequency: e.frequency,
      allocation: e.allocation,
      amount: e.amount,
      percent: e.percent,
      currency: e.currency,
      startDate: e.startDate,
      endDate: e.endDate,
      isAdSpend: e.isAdSpend,
      isMarketing: isMarketing ?? false,
    }));
  }

  async getDailyComponents(storeId: string, range: DateRange): Promise<DailyComponents[]> {
    const store = await this.store(storeId);
    const [rows, ads, expenses, customers] = await Promise.all([
      this.db
        .select()
        .from(schema.dailyStoreMetrics)
        .where(and(eq(schema.dailyStoreMetrics.storeId, storeId), between(schema.dailyStoreMetrics.localDate, range.start, range.end))),
      this.adSpendRows(storeId, store.currency, store.timezone, range),
      this.expenses(storeId),
      this.db
        .select({ d: schema.customer.firstOrderLocalDate, n: sql<number>`count(*)::int` })
        .from(schema.customer)
        .where(and(eq(schema.customer.storeId, storeId), between(schema.customer.firstOrderLocalDate, range.start, range.end)))
        .groupBy(schema.customer.firstOrderLocalDate),
    ]);
    const byDate = new Map(rows.map((r) => [r.localDate, r]));
    const newCustomers = new Map(customers.map((c) => [c.d!, c.n]));
    const adByDate = new Map<string, { spend: Decimal; fx: number }>();
    for (const a of ads) {
      const cur = adByDate.get(a.date) ?? { spend: ZERO, fx: 0 };
      adByDate.set(a.date, a.spendStore ? { spend: cur.spend.plus(a.spendStore), fx: cur.fx } : { spend: cur.spend, fx: cur.fx + 1 });
    }

    const days = eachDay(range);
    const bases = days.map((d) => {
      const r = byDate.get(d);
      return {
        localDate: d,
        revenue: r ? dec(r.revenue) : ZERO,
        netSales: r ? dec(r.grossSales).minus(dec(r.discounts)).minus(dec(r.returns)) : ZERO,
        adSpend: adByDate.get(d)?.spend ?? ZERO,
        ordersCount: r?.ordersCount ?? 0,
      };
    });
    const fx = await this.fxFor(store.currency, expenses.map((e) => e.currency), range);
    const allocated = allocateExpenses(expenses, bases, fx);

    return days.map((d) => {
      const r = byDate.get(d);
      const e = allocated.get(d);
      const ad = adByDate.get(d);
      const money = (k: keyof typeof schema.dailyStoreMetrics.$inferSelect) => (r ? (r[k] as string) : "0");
      return dailyComponents(d, {
        grossSales: money("grossSales"),
        discounts: money("discounts"),
        returns: money("returns"),
        shippingCharged: money("shippingCharged"),
        tips: money("tips"),
        adjustments: money("adjustments"),
        dutiesAndFees: money("dutiesAndFees"),
        taxes: money("taxes"),
        giftCardSales: money("giftCardSales"),
        revenue: money("revenue"),
        cogs: money("cogs"),
        shippingCost: money("shippingCost"),
        handlingCost: money("handlingCost"),
        transactionFees: money("transactionFees"),
        chargebackLoss: money("chargebackLoss"),
        chargebackFees: money("chargebackFees"),
        adSpend: (ad?.spend ?? ZERO).plus(e?.adSpend ?? ZERO),
        variableExpenses: e?.variableExpenses ?? ZERO,
        adLinkedExpenses: e?.adLinkedExpenses ?? ZERO,
        fixedExpenses: e?.fixedExpenses ?? ZERO,
        marketingExpenses: e?.marketingExpenses ?? ZERO,
        revenueMissingCogs: money("revenueMissingCogs"),
        feesEstimatedAmount: money("feesEstimatedAmount"),
        unclassifiedSalesAmount: money("unclassifiedSalesAmount"),
        ordersCount: r?.ordersCount ?? 0,
        unitsSold: r?.unitsSold ?? 0,
        newCustomers: newCustomers.get(d) ?? 0,
        ordersMissingCogs: r?.ordersMissingCogs ?? 0,
        ordersMissingShipping: r?.ordersMissingShipping ?? 0,
        transactionsMissingFees: r?.transactionsMissingFees ?? 0,
        fxIssues: (e?.fxIssues ?? 0) + (ad?.fx ?? 0),
      });
    });
  }

  async getAdSpendByChannel(storeId: string, range: DateRange): Promise<AdChannelSpend[]> {
    const store = await this.store(storeId);
    const ads = await this.adSpendRows(storeId, store.currency, store.timezone, range);
    const channels = new Map<string, { label: string; source: "api" | "manual"; spend: Decimal; value: Decimal | null; otherTz: boolean }>();
    for (const a of ads) {
      if (!a.spendStore) continue;
      const key = a.source === "manual" ? `${a.platform}:manual` : a.platform;
      const c = channels.get(key) ?? { label: `${PLATFORM_LABEL[a.platform] ?? a.platform}${a.source === "manual" && a.platform !== "manual" ? " (manual entries)" : ""}`, source: a.source, spend: ZERO, value: null, otherTz: false };
      c.spend = c.spend.plus(a.spendStore);
      if (a.valueStore) c.value = (c.value ?? ZERO).plus(a.valueStore);
      if (a.other_tz) c.otherTz = true;
      channels.set(key, c);
    }
    // Expenses flagged as ad spend are part of the ad-spend total, so they are listed as a channel too.
    const days = await this.getDailyComponents(storeId, range);
    const adTotal = days.reduce((t, d) => t.plus(dec(d.adSpend)), ZERO);
    const fromChannels = [...channels.values()].reduce((t, c) => t.plus(c.spend), ZERO);
    if (!adTotal.minus(fromChannels).isZero()) channels.set("expenses", { label: "Expenses recorded as ad spend", source: "manual", spend: adTotal.minus(fromChannels), value: null, otherTz: false });
    return [...channels.entries()].map(([channel, c]) => ({
      channel,
      label: c.label,
      source: c.source,
      spend: m(c.spend),
      platformConversionValue: c.value ? m(c.value) : null,
      platformRoas: c.value && !c.spend.isZero() ? m(c.value.div(c.spend)) : null,
      ...(c.otherTz ? { timezoneApproximation: true } : {}),
    }));
  }

  async listOrders(storeId: string, q: OrderQuery): Promise<{ rows: OrderRow[]; total: number }> {
    await this.store(storeId);
    const search = q.search?.trim();
    const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const where = sql`o.store_id = ${storeId} and p.included and o.processed_local_date between ${q.range.start}::date and ${q.range.end}::date
      ${like ? sql`and (o.name ilike ${like} or exists (select 1 from order_line_item li where li.order_id = o.id and (li.title ilike ${like} or li.sku ilike ${like})))` : sql``}`;
    const dir = q.direction === "asc" ? sql`asc` : sql`desc`;
    const order =
      q.sort === "revenue" ? sql`p.revenue ${dir}` : q.sort === "profit" ? sql`p.profit ${dir}` : q.sort === "margin" ? sql`(p.profit / nullif(p.revenue, 0)) ${dir} nulls last` : sql`o.processed_at ${dir}`;
    const pageSize = Math.max(q.pageSize ?? 25, 1);
    const page = Math.max(q.page ?? 1, 1);
    const [rows, total] = await Promise.all([
      this.db.execute(sql`
        select o.id, o.name, o.processed_at, o.processed_local_date::text as local_date, o.financial_status, o.fulfillment_status,
          (select coalesce(sum(li.quantity), 0)::int from order_line_item li where li.order_id = o.id) as items_count,
          r.gross_sales::text, r.discounts::text, r.returns::text,
          p.revenue::text, p.cogs::text, p.shipping_cost::text, p.transaction_fees::text, p.profit::text, p.is_complete
        from "order" o
        join order_profit p on p.order_id = o.id
        left join lateral (select sum(gross_sales) as gross_sales, sum(discounts) as discounts, sum(returns) as returns
                           from order_daily_result d where d.order_id = o.id) r on true
        where ${where}
        order by ${order}, o.id
        limit ${pageSize} offset ${(page - 1) * pageSize}`),
      this.db.execute(sql`select count(*)::int as n from "order" o join order_profit p on p.order_id = o.id where ${where}`),
    ]);
    type Row = { id: string; name: string; processed_at: Date | string; local_date: string; financial_status: string | null; fulfillment_status: string | null; items_count: number; gross_sales: string | null; discounts: string | null; returns: string | null; revenue: string; cogs: string; shipping_cost: string; transaction_fees: string; profit: string; is_complete: boolean };
    return {
      rows: (rows.rows as Row[]).map((r) => {
        const revenue = dec(r.revenue);
        return {
          id: r.id,
          name: r.name,
          processedAt: new Date(r.processed_at).toISOString(),
          localDate: r.local_date,
          financialStatus: (r.financial_status ?? "unknown").toLowerCase(),
          fulfillmentStatus: (r.fulfillment_status ?? "unknown").toLowerCase(),
          itemsCount: r.items_count,
          grossSales: m(dec(r.gross_sales ?? "0")),
          discounts: m(dec(r.discounts ?? "0")),
          returns: m(dec(r.returns ?? "0")),
          revenue: m(revenue),
          cogs: m(dec(r.cogs)),
          shippingCost: m(dec(r.shipping_cost)),
          transactionFees: m(dec(r.transaction_fees)),
          profit: m(dec(r.profit)),
          margin: revenue.isZero() ? null : m(dec(r.profit).div(revenue)),
          isComplete: r.is_complete,
        };
      }),
      total: (total.rows[0] as { n: number }).n,
    };
  }

  async getOrder(storeId: string, orderId: string): Promise<OrderDetail | null> {
    await this.store(storeId);
    const [o] = await this.db.select().from(schema.order).where(and(eq(schema.order.id, orderId), eq(schema.order.storeId, storeId)));
    if (!o) return null;
    const [profit] = await this.db.select().from(schema.orderProfit).where(eq(schema.orderProfit.orderId, orderId));
    if (!profit || !profit.included) return null;
    const [days, lines, cogsLines, row] = await Promise.all([
      this.db.select().from(schema.orderDailyResult).where(eq(schema.orderDailyResult.orderId, orderId)).orderBy(asc(schema.orderDailyResult.localDate)),
      this.db.select().from(schema.orderLineItem).where(eq(schema.orderLineItem.orderId, orderId)).orderBy(asc(schema.orderLineItem.shopifyGid)),
      this.db.select().from(schema.orderCogsLine).where(eq(schema.orderCogsLine.orderId, orderId)),
      this.listOrders(storeId, { range: { start: o.processedLocalDate, end: o.processedLocalDate }, search: o.name, pageSize: 50 }).then((r) => r.rows.find((x) => x.id === orderId)),
    ]);
    if (!row) return null;
    const trace = profit.trace as { cogs?: { status?: CostStatus | null }; shipping?: { status?: CostStatus | null; source?: string }; handling?: { status?: CostStatus | null; source?: string }; fees?: { status?: CostStatus | null; transactions?: { source: string }[] }; chargebacks?: { disputes?: { feeStatus: CostStatus }[] } };

    const breakdown: BreakdownLine[] = [];
    const push = (key: string, label: string, amount: Decimal, status: CostStatus | null, source: string, date: string) => {
      const text = source.charAt(0).toUpperCase() + source.slice(1);
      if (!amount.isZero() || status === "missing") breakdown.push({ key, label, amount: m(amount), status, source: text, ...(date !== o.processedLocalDate ? { date } : {}) });
    };
    for (const d of days) {
      const v = (k: "grossSales" | "discounts" | "returns" | "shippingCharged" | "tips" | "adjustments" | "cogs" | "shippingCost" | "handlingCost" | "transactionFees" | "chargebackLoss" | "chargebackFees") => dec(d[k]);
      const dayCogs = cogsLines.filter((l) => l.localDate === d.localDate);
      const isOrderDay = d.localDate === o.processedLocalDate;
      push("grossSales", "Gross sales", v("grossSales"), null, "Shopify order sales (excluding tax)", d.localDate);
      push("discounts", "Discounts", v("discounts").neg(), null, "Shopify discount allocations", d.localDate);
      push("returns", "Returns", v("returns").neg(), null, "Shopify refunds and removed items", d.localDate);
      push("shippingCharged", "Shipping charged", v("shippingCharged"), null, "Paid by the customer", d.localDate);
      push("tips", "Tips", v("tips"), null, "Shopify tip line", d.localDate);
      push("adjustments", "Adjustments", v("adjustments"), null, "Unclassified Shopify sales", d.localDate);
      const cogsStatus = worstStatus(dayCogs.map((l) => l.status as EngineCostStatus), "actual");
      const reversal = dayCogs.length > 0 && dayCogs.every((l) => l.kind === "reversal");
      if (dayCogs.length) {
        push(reversal ? "cogsReversal" : "cogs", reversal ? "COGS reversed (returned goods)" : "COGS", v("cogs").neg(), cogsStatus,
          cogsStatus === "missing" ? "Some items have no cost — counted as 0 and flagged" : reversal ? "Original unit cost of restocked items" : "Landed unit cost effective on the order date", d.localDate);
      }
      if (isOrderDay) {
        push("shippingCost", "Shipping cost", v("shippingCost").neg(), trace.shipping?.status ?? null, trace.shipping?.source ?? "", d.localDate);
        push("handlingCost", "Handling", v("handlingCost").neg(), trace.handling?.status ?? null, trace.handling?.source ?? "", d.localDate);
      }
      push("transactionFees", "Transaction fees", v("transactionFees").neg(), trace.fees?.status ?? null, trace.fees?.transactions?.[0]?.source ?? "Payment processing", d.localDate);
      push("chargebackLoss", "Chargeback loss", v("chargebackLoss").neg(), "actual", "Lost or accepted chargeback", d.localDate);
      push("chargebackFee", "Chargeback fee", v("chargebackFees").neg(), trace.chargebacks?.disputes?.[0]?.feeStatus ?? null, "Dispute fee", d.localDate);
    }

    const saleCost = new Map(cogsLines.filter((l) => l.kind === "sale" && l.lineItemGid).map((l) => [l.lineItemGid!, l]));
    const sumDays = (k: "taxes" | "giftCardSales") => days.reduce((t, d) => t.plus(dec(d[k])), ZERO);
    return {
      ...row,
      lineItems: lines.map((l) => {
        const c = saleCost.get(l.shopifyGid);
        return {
          title: l.title,
          variantTitle: l.variantTitle ?? "",
          sku: l.sku ?? "",
          quantity: l.quantity,
          unitPrice: l.originalUnitPrice,
          unitCost: c?.unitCost ?? null,
          costStatus: (l.isGiftCard ? "actual" : (c?.status ?? "missing")) as CostStatus,
        };
      }),
      breakdown,
      memo: { taxes: m(sumDays("taxes")), giftCardSales: m(sumDays("giftCardSales")) },
    };
  }

  async listProducts(storeId: string, range: DateRange): Promise<ProductRow[]> {
    await this.store(storeId);
    const res = await this.db.execute(sql`
      with sales as (
        select li.variant_id,
          sum(case when ${ADDS_UNITS} then abs(coalesce(l.quantity, 0)) else -abs(coalesce(l.quantity, 0)) end)::int as units,
          sum(case when ${ADDS_UNITS} then l.total_amount - l.total_tax_amount + l.total_discount_before_taxes else 0 end) as gross,
          sum(case when ${ADDS_UNITS} then l.total_discount_before_taxes else 0 end) as discounts,
          sum(case when ${ADDS_UNITS} then 0 else -(l.total_amount - l.total_tax_amount) end) as returns
        from sale_ledger_entry l
        join order_profit p on p.order_id = l.order_id and p.included
        join order_line_item li on li.store_id = l.store_id and li.shopify_gid = l.line_item_gid
        where l.store_id = ${storeId} and l.line_type = 'PRODUCT' and l.happened_local_date between ${range.start}::date and ${range.end}::date
          and not li.is_gift_card and li.variant_id is not null
        group by 1
      ),
      costs as (
        select c.variant_id, sum(c.amount) as cogs,
          case when bool_or(c.status = 'missing') then 'missing' when bool_or(c.status = 'estimated') then 'estimated'
               when bool_or(c.status = 'rule') then 'rule' when bool_or(c.status = 'manual') then 'manual' else 'actual' end as status
        from order_cogs_line c join order_profit p on p.order_id = c.order_id and p.included
        where c.store_id = ${storeId} and c.variant_id is not null and c.local_date between ${range.start}::date and ${range.end}::date
        group by 1
      )
      select v.id as variant_id, pr.title as product_title, v.title as variant_title, coalesce(v.sku, '') as sku,
        coalesce(s.units, 0) as units, coalesce(s.gross, 0)::text as gross, coalesce(s.discounts, 0)::text as discounts,
        coalesce(s.returns, 0)::text as returns, coalesce(c.cogs, 0)::text as cogs, coalesce(c.status, 'missing') as status
      from sales s
      full join costs c on c.variant_id = s.variant_id
      join variant v on v.id = coalesce(s.variant_id, c.variant_id)
      join product pr on pr.id = v.product_id
      where v.store_id = ${storeId}
      order by coalesce(s.gross, 0) desc, v.id`);
    type Row = { variant_id: string; product_title: string; variant_title: string; sku: string; units: number; gross: string; discounts: string; returns: string; cogs: string; status: CostStatus };
    return (res.rows as Row[]).map((r) => {
      const net = dec(r.gross).minus(dec(r.discounts)).minus(dec(r.returns));
      const cogs = dec(r.cogs);
      return {
        variantId: r.variant_id,
        productTitle: r.product_title,
        variantTitle: r.variant_title === "Default Title" ? "" : r.variant_title,
        sku: r.sku,
        unitsSold: r.units,
        grossSales: m(dec(r.gross)),
        discounts: m(dec(r.discounts)),
        returns: m(dec(r.returns)),
        netSales: m(net),
        cogs: m(cogs),
        grossProfit: m(net.minus(cogs)),
        grossMargin: net.isZero() ? null : m(net.minus(cogs).div(net)),
        costStatus: r.status,
      };
    });
  }
}
