import {
  dailyComponents,
  dec,
  Decimal,
  eachDay,
  roundToMinor,
  toMoneyString,
  ZERO,
  type CampaignSpendRow,
  type CustomerActivityRow,
  type UtmRow,
  type DailyComponents,
  type DateRange,
  type LocalDate,
} from "@profitlens/finance";
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
import { DEMO_CATALOG, DEMO_FIXED_EXPENSES, DEMO_GOOGLE_CAMPAIGNS, DEMO_RULES, DEMO_STORE } from "./catalog";
import { demoAdSpend, demoUtm, eventRevenue, generateDemoHistory, orderEvents, type DemoEvent, type DemoHistory, type DemoOrder } from "./generator";

const m = (d: Decimal) => toMoneyString(d);

function daysInMonth(date: LocalDate): number {
  const [y, mo] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Lifetime per-order result (all events of the order that have happened). */
function orderTotals(order: DemoOrder, now: Date) {
  const events = orderEvents(order).filter((e) => e.at <= now);
  const total = (k: keyof Pick<DemoEvent, "grossSales" | "discounts" | "returns" | "cogs" | "shippingCost" | "transactionFees" | "chargebackLoss" | "chargebackFees" | "variableExpenses" | "taxes" | "giftCardSales">) =>
    events.reduce((s, e) => s.plus(e[k]), ZERO);
  const revenue = events.reduce((s, e) => s.plus(eventRevenue(e)), ZERO);
  const costs = total("cogs")
    .plus(total("shippingCost"))
    .plus(total("transactionFees"))
    .plus(total("chargebackLoss"))
    .plus(total("chargebackFees"))
    .plus(total("variableExpenses"));
  return { events, total, revenue, profit: revenue.minus(costs) };
}

function financialStatus(order: DemoOrder, now: Date): string {
  if (order.refund && order.refund.at <= now) {
    const full = order.refund.lines.length === order.lines.filter((l) => !l.variant.isGiftCard).length &&
      order.refund.lines.every((rl) => rl.quantity === order.lines[rl.lineIndex]!.quantity);
    return full ? "refunded" : "partially_refunded";
  }
  return "paid";
}

function fulfillmentStatus(order: DemoOrder, now: Date): string {
  if (order.lines.every((l) => l.variant.isGiftCard)) return "fulfilled";
  return now.getTime() - order.processedAt.getTime() > 2 * 86_400_000 ? "fulfilled" : "unfulfilled";
}

/**
 * In-memory ReportingDataSource for the demo store. Data is generated deterministically on first
 * use and refreshed when the store-local day changes. It is never persisted.
 */
export class DemoDataSource implements ReportingDataSource {
  private history: DemoHistory | null = null;
  private rowCache = new Map<string, OrderRow>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private data(): DemoHistory {
    const now = this.clock();
    // Regenerate at most every 5 minutes so "today" keeps filling in during the day.
    if (!this.history || now.getTime() - this.history.generatedAt.getTime() > 5 * 60_000) {
      this.history = generateDemoHistory(now);
      this.rowCache = new Map();
    }
    return this.history;
  }

  /** "Now" as of the current generated history, so rows and daily totals always agree. */
  private asOf(): Date {
    return this.data().generatedAt;
  }

  private cachedRow(order: DemoOrder): OrderRow {
    let row = this.rowCache.get(order.id);
    if (!row) this.rowCache.set(order.id, (row = this.toRow(order, this.asOf())));
    return row;
  }

  private summary(): StoreSummary {
    return {
      id: DEMO_STORE.id,
      name: DEMO_STORE.name,
      currency: DEMO_STORE.currency,
      timezone: DEMO_STORE.timezone,
      isDemo: true,
      lastSyncedAt: this.data().generatedAt.toISOString(),
    };
  }

  async listStores(): Promise<StoreSummary[]> {
    return [this.summary()];
  }

  async getStore(storeId: string): Promise<StoreSummary | null> {
    return storeId === DEMO_STORE.id ? this.summary() : null;
  }

  async getDailyComponents(storeId: string, range: DateRange): Promise<DailyComponents[]> {
    if (storeId !== DEMO_STORE.id) return [];
    const h = this.data();
    return eachDay(range).map((date) => {
      if (date < DEMO_STORE.historyStart || date > h.today) return dailyComponents(date);
      const events = h.eventsByDate.get(date) ?? [];
      const s = (k: Parameters<typeof sumKey>[1]) => sumKey(events, k);
      const revenue = events.reduce((acc, e) => acc.plus(eventRevenue(e)), ZERO);
      const ads = demoAdSpend(date, revenue);
      const dim = daysInMonth(date);
      const fixed = DEMO_FIXED_EXPENSES.reduce((acc, x) => acc.plus(dec(x.monthly).div(dim)), ZERO);
      const marketing = DEMO_FIXED_EXPENSES.filter((x) => x.marketing).reduce((acc, x) => acc.plus(dec(x.monthly).div(dim)), ZERO);
      return dailyComponents(date, {
        grossSales: s("grossSales"),
        discounts: s("discounts"),
        returns: s("returns"),
        shippingCharged: s("shippingCharged"),
        tips: s("tips"),
        taxes: s("taxes"),
        giftCardSales: s("giftCardSales"),
        revenue,
        cogs: s("cogs"),
        shippingCost: s("shippingCost"),
        transactionFees: s("transactionFees"),
        chargebackLoss: s("chargebackLoss"),
        chargebackFees: s("chargebackFees"),
        variableExpenses: s("variableExpenses"),
        adSpend: ads.google.plus(ads.meta),
        fixedExpenses: fixed,
        marketingExpenses: marketing,
        revenueMissingCogs: s("revenueMissingCogs"),
        ordersCount: events.reduce((n, e) => n + e.orders, 0),
        unitsSold: events.reduce((n, e) => n + e.units, 0),
        newCustomers: events.reduce((n, e) => n + e.newCustomers, 0),
        ordersMissingCogs: events.filter((e) => e.missingCogs).length,
      });
    });
  }

  async getAdSpendByChannel(storeId: string, range: DateRange): Promise<AdChannelSpend[]> {
    if (storeId !== DEMO_STORE.id) return [];
    const days = await this.getDailyComponents(storeId, range);
    let google = ZERO;
    let googleValue = ZERO;
    let meta = ZERO;
    for (const d of days) {
      if (dec(d.adSpend).isZero()) continue;
      const a = demoAdSpend(d.localDate, dec(d.revenue));
      google = google.plus(a.google);
      googleValue = googleValue.plus(a.googleValue);
      meta = meta.plus(a.meta);
    }
    return [
      {
        channel: "google_ads",
        label: "Google Ads",
        source: "api",
        spend: m(google),
        platformConversionValue: m(googleValue),
        platformRoas: google.isZero() ? null : m(googleValue.div(google)),
      },
      { channel: "meta", label: "Meta (manual entries)", source: "manual", spend: m(meta), platformConversionValue: null, platformRoas: null },
    ];
  }

  async getCampaignSpend(storeId: string, range: DateRange): Promise<CampaignSpendRow[]> {
    const channels = await this.getAdSpendByChannel(storeId, range);
    const google = channels.find((c) => c.channel === "google_ads");
    const meta = channels.find((c) => c.channel === "meta");
    if (!google || !meta) return [];
    // Shares of the exact channel totals; the last campaign takes the remainder so campaigns sum to the channel.
    const split = (total: string, key: "share" | "valueShare" = "share") => {
      const parts = DEMO_GOOGLE_CAMPAIGNS.slice(0, -1).map((c) => roundToMinor(dec(total).times(c[key]), DEMO_STORE.currency));
      return [...parts, parts.reduce((rest, p) => rest.minus(p), dec(total))];
    };
    const spend = split(google.spend);
    const value = split(google.platformConversionValue ?? "0", "valueShare");
    return [
      ...DEMO_GOOGLE_CAMPAIGNS.map((c, i) => ({
        platform: "google_ads" as const,
        accountName: "Demo Google Ads",
        campaignId: c.id,
        campaignName: c.name,
        source: "api" as const,
        attributable: true,
        spend: m(spend[i]!),
        platformValue: m(value[i]!),
        clicks: null,
        otherTimezone: false,
      })),
      { platform: "meta", accountName: "Manual ad spend", campaignId: "manual:demo-meta", campaignName: "All Meta spend (manual entries)", source: "manual", attributable: false, spend: meta.spend, platformValue: null, clicks: null, otherTimezone: false },
    ];
  }

  async getUtmPerformance(storeId: string, range: DateRange): Promise<UtmRow[]> {
    if (storeId !== DEMO_STORE.id) return [];
    const h = this.data();
    const acc = new Map<string, { utm: ReturnType<typeof demoUtm>; orders: number; revenue: Decimal; profit: Decimal }>();
    for (const date of eachDay(range)) {
      for (const e of h.eventsByDate.get(date) ?? []) {
        const utm = demoUtm(e.orderId);
        const key = `${utm.source}|${utm.medium}|${utm.campaign}`;
        const a = acc.get(key) ?? { utm, orders: 0, revenue: ZERO, profit: ZERO };
        const revenue = eventRevenue(e);
        // Same order profit as the demo Orders page (orderTotals).
        const costs = e.cogs.plus(e.shippingCost).plus(e.transactionFees).plus(e.chargebackLoss).plus(e.chargebackFees).plus(e.variableExpenses);
        acc.set(key, { utm, orders: a.orders + e.orders, revenue: a.revenue.plus(revenue), profit: a.profit.plus(revenue.minus(costs)) });
      }
    }
    return [...acc.values()].map((a) => ({ ...a.utm, orders: a.orders, revenue: m(a.revenue), orderProfit: m(a.profit) }));
  }

  private toRow(order: DemoOrder, now: Date): OrderRow {
    const t = orderTotals(order, now);
    return {
      id: order.id,
      name: order.name,
      processedAt: order.processedAt.toISOString(),
      localDate: order.localDate,
      financialStatus: financialStatus(order, now),
      fulfillmentStatus: fulfillmentStatus(order, now),
      itemsCount: order.lines.reduce((n, l) => n + l.quantity, 0),
      grossSales: m(t.total("grossSales")),
      discounts: m(t.total("discounts")),
      returns: m(t.total("returns")),
      revenue: m(t.revenue),
      cogs: m(t.total("cogs")),
      shippingCost: m(t.total("shippingCost")),
      transactionFees: m(t.total("transactionFees")),
      profit: m(t.profit),
      margin: t.revenue.isZero() ? null : m(t.profit.div(t.revenue)),
      isComplete: !order.lines.some((l) => l.unitCost === null && !l.variant.isGiftCard),
    };
  }

  async listOrders(storeId: string, q: OrderQuery): Promise<{ rows: OrderRow[]; total: number }> {
    if (storeId !== DEMO_STORE.id) return { rows: [], total: 0 };
    const h = this.data();
    const search = q.search?.trim().toLowerCase();
    let rows = h.orders
      .filter((o) => o.localDate >= q.range.start && o.localDate <= q.range.end)
      .filter((o) => !search || o.name.toLowerCase().includes(search) || o.lines.some((l) => l.variant.productTitle.toLowerCase().includes(search) || l.variant.sku.toLowerCase().includes(search)))
      .map((o) => this.cachedRow(o));
    const dir = q.direction === "asc" ? 1 : -1;
    const key = q.sort ?? "processedAt";
    if (key === "processedAt") {
      rows.sort((a, b) => a.processedAt.localeCompare(b.processedAt) * dir);
    } else {
      // Decorate once, then sort (avoids re-parsing decimals inside the comparator).
      const keyed = rows.map((r) => {
        const rev = dec(r.revenue);
        const k = key === "revenue" ? rev : key === "profit" ? dec(r.profit) : rev.isZero() ? null : dec(r.profit).div(rev);
        return { r, k };
      });
      keyed.sort((a, b) => {
        if (a.k === null || b.k === null) return a.k === b.k ? 0 : a.k === null ? 1 : -1; // nulls last
        return a.k.comparedTo(b.k) * dir;
      });
      rows = keyed.map((x) => x.r);
    }
    // Page size is validated by the API layer; the source only enforces a lower bound.
    const pageSize = Math.max(q.pageSize ?? 25, 1);
    const page = Math.max(q.page ?? 1, 1);
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length };
  }

  async getOrder(storeId: string, orderId: string): Promise<OrderDetail | null> {
    if (storeId !== DEMO_STORE.id) return null;
    const order = this.data().ordersById.get(orderId);
    if (!order) return null;
    const now = this.asOf();
    const row = this.cachedRow(order);
    const t = orderTotals(order, now);
    const lines: BreakdownLine[] = [];
    const push = (key: string, label: string, amount: Decimal, status: CostStatus | null, source: string, date?: string) => {
      if (!amount.isZero()) lines.push({ key, label, amount: m(amount), status, source, ...(date ? { date } : {}) });
    };
    for (const e of t.events) {
      const date = e.localDate !== order.localDate ? e.localDate : undefined;
      if (e.kind === "order") {
        push("grossSales", "Gross sales", e.grossSales, null, "Shopify order sales");
        push("discounts", "Discounts", e.discounts.negated(), null, "Shopify discount allocations");
        push("shippingCharged", "Shipping charged", e.shippingCharged, null, "Shopify shipping line");
        push("tips", "Tips", e.tips, null, "Shopify tip line");
        const missing = order.lines.some((l) => l.unitCost === null && !l.variant.isGiftCard);
        push("cogs", "COGS", e.cogs.negated(), missing ? "missing" : "manual", missing ? "Some items have no cost configured — counted as 0 and flagged" : "Variant cost effective on the order date");
        if (missing && e.cogs.isZero()) lines.push({ key: "cogs", label: "COGS", amount: m(ZERO), status: "missing", source: "No cost configured — counted as 0 and flagged" });
        push("shippingCost", "Shipping cost", e.shippingCost.negated(), "rule", `Rule: ${DEMO_RULES.shippingCostFirst} first item + ${DEMO_RULES.shippingCostAdditional} each additional`);
        push("transactionFees", "Transaction fees", e.transactionFees.negated(), "actual", `Payment processor fee (${DEMO_RULES.feePercent}% + ${DEMO_RULES.feeFixed})`);
        push("packaging", "Packaging (per-order expense)", e.variableExpenses.negated(), "rule", "Custom expense: per order");
      } else if (e.kind === "return") {
        push("returns", "Returns", e.returns.negated(), null, "Shopify refund (return agreement)", date);
        push("shippingRefund", "Shipping refunded", e.shippingCharged, null, "Shopify refund shipping", date);
        push("cogsReversal", "COGS reversed (restocked)", e.cogs.negated(), "rule", "Restock type RETURN reverses original unit cost", date);
      } else {
        push("chargebackLoss", "Chargeback loss", e.chargebackLoss.negated(), "actual", "Dispute lost", date);
        push("chargebackFee", "Chargeback fee", e.chargebackFees.negated(), "actual", "Dispute fee", date);
      }
    }
    return {
      ...row,
      lineItems: order.lines.map((l) => ({
        title: l.variant.productTitle,
        variantTitle: l.variant.variantTitle,
        sku: l.variant.sku,
        quantity: l.quantity,
        unitPrice: m(l.unitPrice),
        unitCost: l.unitCost === null ? null : m(l.unitCost),
        costStatus: l.unitCost === null ? "missing" : "manual",
      })),
      breakdown: lines,
      memo: { taxes: m(t.total("taxes")), giftCardSales: m(t.total("giftCardSales")) },
    };
  }

  async getCustomerActivity(storeId: string, end: LocalDate): Promise<CustomerActivity> {
    if (storeId !== DEMO_STORE.id) return { rows: [], historyStart: null, historyComplete: true };
    const h = this.data();
    const acc = new Map<string, { customerId: string; date: LocalDate; orders: number; revenue: Decimal; cogs: Decimal; missing: Decimal }>();
    for (const date of eachDay({ start: DEMO_STORE.historyStart, end: end < h.today ? end : h.today })) {
      for (const e of h.eventsByDate.get(date) ?? []) {
        const customerId = h.ordersById.get(e.orderId)!.customerId;
        const key = `${customerId}|${date}`;
        const a = acc.get(key) ?? { customerId, date, orders: 0, revenue: ZERO, cogs: ZERO, missing: ZERO };
        acc.set(key, {
          ...a,
          orders: a.orders + e.orders,
          revenue: a.revenue.plus(eventRevenue(e)),
          cogs: a.cogs.plus(e.cogs),
          missing: a.missing.plus(e.revenueMissingCogs),
        });
      }
    }
    const rows: CustomerActivityRow[] = [...acc.values()].map((a) => ({
      customerId: a.customerId,
      firstOrderDate: h.customerFirstDate.get(a.customerId)!,
      date: a.date,
      ordersPlaced: a.orders,
      revenue: m(a.revenue),
      cogs: m(a.cogs),
      revenueMissingCogs: m(a.missing),
    }));
    // The demo store opened on its history start, so its history is complete.
    return { rows, historyStart: DEMO_STORE.historyStart, historyComplete: true };
  }

  async listProducts(storeId: string, range: DateRange): Promise<ProductRow[]> {
    if (storeId !== DEMO_STORE.id) return [];
    const h = this.data();
    const now = this.asOf();
    type Acc = { units: number; gross: Decimal; disc: Decimal; ret: Decimal; cogs: Decimal };
    const acc = new Map<string, Acc>();
    const get = (id: string) => {
      let a = acc.get(id);
      if (!a) acc.set(id, (a = { units: 0, gross: ZERO, disc: ZERO, ret: ZERO, cogs: ZERO }));
      return a;
    };
    const inRange = (d: LocalDate) => d >= range.start && d <= range.end;
    for (const o of h.orders) {
      if (inRange(o.localDate)) {
        for (const l of o.lines) {
          if (l.variant.isGiftCard) continue;
          const a = get(l.variant.id);
          a.units += l.quantity;
          a.gross = a.gross.plus(l.unitPrice.times(l.quantity));
          a.disc = a.disc.plus(l.discount);
          if (l.unitCost) a.cogs = a.cogs.plus(l.unitCost.times(l.quantity));
        }
      }
      if (o.refund && o.refund.at <= now && inRange(o.refund.localDate)) {
        for (const rl of o.refund.lines) {
          const l = o.lines[rl.lineIndex]!;
          const a = get(l.variant.id);
          a.units -= rl.quantity;
          a.ret = a.ret.plus(l.unitPrice.minus(l.discount.div(l.quantity)).times(rl.quantity));
          if (rl.restock === "RETURN" && l.unitCost) a.cogs = a.cogs.minus(l.unitCost.times(rl.quantity));
        }
      }
    }
    return DEMO_CATALOG.filter((v) => !v.isGiftCard && acc.has(v.id)).map((v) => {
      const a = acc.get(v.id)!;
      const net = a.gross.minus(a.disc).minus(a.ret);
      return {
        variantId: v.id,
        productTitle: v.productTitle,
        variantTitle: v.variantTitle,
        sku: v.sku,
        unitsSold: a.units,
        grossSales: m(a.gross),
        discounts: m(a.disc),
        returns: m(a.ret),
        netSales: m(net),
        cogs: m(a.cogs),
        grossProfit: m(net.minus(a.cogs)),
        grossMargin: net.isZero() ? null : m(net.minus(a.cogs).div(net)),
        costStatus: v.costs.length === 0 ? "missing" : "manual",
      };
    });
  }
}

function sumKey(events: readonly DemoEvent[], k: "grossSales" | "discounts" | "returns" | "shippingCharged" | "tips" | "taxes" | "giftCardSales" | "cogs" | "shippingCost" | "transactionFees" | "chargebackLoss" | "chargebackFees" | "variableExpenses" | "revenueMissingCogs"): Decimal {
  return events.reduce((s, e) => s.plus(e[k]), ZERO);
}
