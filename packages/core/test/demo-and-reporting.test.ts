import { dec, sum, sumComponents, ZERO, type DateRange } from "@profitlens/finance";
import { describe, expect, it } from "vitest";
import { DemoDataSource, DEMO_STORE } from "../src/demo/index";
import { ReportingService, type ReportingDataSource } from "../src/index";

// Fixed clock: 2026-10-18 14:00 Sydney (AEDT, UTC+11).
const NOW = new Date("2026-10-18T03:00:00Z");
const source = new DemoDataSource(() => NOW);
const service = new ReportingService(source);
const fullHistory = { start: DEMO_STORE.historyStart, end: "2026-10-18" };

describe("demo data source", () => {
  it("is flagged as demo", async () => {
    const store = await source.getStore("demo");
    expect(store?.isDemo).toBe(true);
    expect(await source.getStore("some-real-store")).toBeNull();
  });

  it("is deterministic for the same clock", async () => {
    const other = new DemoDataSource(() => NOW);
    const a = await source.getDailyComponents("demo", { start: "2026-09-01", end: "2026-09-30" });
    const b = await other.getDailyComponents("demo", { start: "2026-09-01", end: "2026-09-30" });
    expect(a).toEqual(b);
  });

  it("never contains events after 'now' (today is partial, future is empty)", async () => {
    const future = await source.getDailyComponents("demo", { start: "2026-10-19", end: "2026-10-25" });
    expect(future.every((d) => dec(d.revenue).isZero() && d.ordersCount === 0)).toBe(true);
    const { rows } = await source.listOrders("demo", { range: { start: "2026-10-18", end: "2026-10-18" }, pageSize: 200 });
    expect(rows.every((r) => new Date(r.processedAt) <= NOW)).toBe(true);
  });

  it("daily totals reconcile exactly with order-level results over the full history", async () => {
    const days = await source.getDailyComponents("demo", fullHistory);
    const totals = sumComponents(days);
    const { rows: all, total } = await source.listOrders("demo", { range: fullHistory, pageSize: 1_000_000 });
    expect(all).toHaveLength(total);
    expect(totals.ordersCount).toBe(total);
    const orderRevenue = sum(all.map((r) => dec(r.revenue)));
    const orderCogs = sum(all.map((r) => dec(r.cogs)));
    const orderFees = sum(all.map((r) => dec(r.transactionFees)));
    expect(totals.revenue.toFixed(6)).toBe(orderRevenue.toFixed(6));
    expect(totals.cogs.toFixed(6)).toBe(orderCogs.toFixed(6));
    expect(totals.transactionFees.toFixed(6)).toBe(orderFees.toFixed(6));
  });

  it("flags orders containing products without a configured cost", async () => {
    const days = await source.getDailyComponents("demo", { start: "2026-09-01", end: "2026-09-30" });
    const totals = sumComponents(days);
    expect(totals.ordersMissingCogs).toBeGreaterThan(0);
    expect(totals.revenueMissingCogs.gt(ZERO)).toBe(true);
  });

  it("applies the effective-dated cost change (Trail Runner 31.20 → 33.90 on 2026-07-01)", async () => {
    const unitCostFor = async (date: string) => {
      const { rows } = await source.listOrders("demo", { range: { start: date, end: date }, search: "TRS-BLK", pageSize: 500 });
      const detail = (await source.getOrder("demo", rows[0]!.id))!;
      return detail.lineItems.find((l) => l.sku.startsWith("TRS-"))!.unitCost;
    };
    expect(await unitCostFor("2026-06-30")).toBe("31.200000");
    expect(await unitCostFor("2026-07-01")).toBe("33.900000");
  });

  it("order detail breakdown sums to the order's profit", async () => {
    const { rows } = await source.listOrders("demo", { range: { start: "2026-08-01", end: "2026-08-31" }, pageSize: 200 });
    for (const row of rows.slice(0, 50)) {
      const detail = (await source.getOrder("demo", row.id))!;
      const total = sum(detail.breakdown.map((l) => dec(l.amount)));
      expect(total.toFixed(6)).toBe(dec(row.profit).toFixed(6));
    }
  });
});

describe("reporting service", () => {
  it("builds a dashboard whose net profit equals revenue − total costs", async () => {
    const d = (await service.dashboard("demo", { start: "2026-10-01", end: "2026-10-17" }, "previous_period"))!;
    const k = d.kpis;
    expect(dec(k.revenue.value!).minus(dec(k.totalCosts.value!)).toFixed(6)).toBe(dec(k.netProfit.value!).toFixed(6));
    expect(d.comparison).toEqual({ start: "2026-09-14", end: "2026-09-30" });
    expect(k.revenue.change).not.toBeNull();
    expect(d.series).toHaveLength(17);
    expect(sum(d.series.map((p) => dec(p.revenue))).toFixed(6)).toBe(dec(k.revenue.value!).toFixed(6));
    expect(d.store.isDemo).toBe(true);
    expect(d.completeness.complete).toBe(false); // demo catalog has missing costs
  });

  it("builds a P&L whose bucket columns sum to the total column", async () => {
    const pnl = (await service.profitAndLoss("demo", { start: "2026-07-01", end: "2026-09-30" }, "month"))!;
    expect(pnl.columns.map((c) => c.key)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    for (const row of pnl.rows.filter((r) => r.kind !== "ratio")) {
      const colSum = sum(row.values.map((v) => (v === null ? ZERO : dec(v))));
      expect(colSum.toFixed(6), row.key).toBe(dec(row.total!).toFixed(6));
    }
    const ads = pnl.rows.find((r) => r.key === "adSpend")!;
    expect(sum(ads.children.map((c) => dec(c.total!))).toFixed(6)).toBe(dec(ads.total!).toFixed(6));
    expect(pnl.basis).toBe("management");
  });

  it("explains the change in net profit with a bridge whose steps sum exactly", async () => {
    const d = (await service.dashboard("demo", { start: "2026-10-01", end: "2026-10-17" }, "previous_period"))!;
    const b = d.bridge!;
    expect(dec(b.end).toFixed(6)).toBe(dec(d.kpis.netProfit.value!).toFixed(6));
    expect(sum(b.steps.map((s) => dec(s.effect))).toFixed(6)).toBe(dec(b.end).minus(dec(b.start)).toFixed(6));
    expect(b.steps[0]!.key).toBe("volume");
    expect((await service.dashboard("demo", { start: "2026-10-01", end: "2026-10-17" }, "none"))!.bridge).toBeNull();
  });

  it("compares stores side by side and consolidates only same-currency stores", async () => {
    // A second store aliasing the demo data, in the same currency or another one.
    const twin = (currency: string): ReportingDataSource =>
      new Proxy(source, {
        get(target, prop, receiver) {
          if (prop === "getStore")
            return async (id: string) => (id === "twin" ? { ...(await target.getStore("demo"))!, id: "twin", name: "Twin", currency } : target.getStore(id));
          if (prop === "getDailyComponents") return (id: string, r: DateRange) => target.getDailyComponents(id === "twin" ? "demo" : id, r);
          return Reflect.get(target, prop, receiver);
        },
      });
    const a = { start: "2026-09-01", end: "2026-09-30" };
    const b = { start: "2026-08-01", end: "2026-08-31" };
    const same = (await new ReportingService(twin(DEMO_STORE.currency)).storeComparison([
      { storeId: "demo", range: a },
      { storeId: "twin", range: b },
    ]))!;
    expect(same.consolidated).toEqual({ currency: DEMO_STORE.currency, converted: false });
    const pnlA = (await service.profitAndLoss("demo", a, "month"))!;
    for (const row of same.rows) {
      expect(row.values[0], row.key).toBe(pnlA.rows.find((r) => r.key === row.key)!.total);
      if (row.kind !== "ratio") expect(dec(row.total!).toFixed(6), row.key).toBe(dec(row.values[0]!).plus(dec(row.values[1]!)).toFixed(6));
    }
    const margin = same.rows.find((r) => r.kind === "ratio")!;
    expect(margin.total).not.toBeNull(); // recomputed from the summed totals, never an average of ratios

    const mixed = (await new ReportingService(twin("EUR")).storeComparison([
      { storeId: "demo", range: a },
      { storeId: "twin", range: a },
    ]))!;
    expect(mixed.consolidated.currency).toBeNull();
    expect(mixed.rows.every((r) => r.total === null)).toBe(true);

    // With rates, the EUR twin is converted day by day into AUD (EUR→AUD 1.65 on every day of September).
    const rates = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, base: "EUR", quote: "AUD", rate: "1.65" }));
    const withRates = (list: typeof rates): ReportingDataSource => {
      const base = twin("EUR");
      return new Proxy(base, { get: (t, prop, r) => (prop === "getFxRates" ? async () => list : Reflect.get(t, prop, r)) });
    };
    const fx = (await new ReportingService(withRates(rates)).storeComparison([{ storeId: "demo", range: a }, { storeId: "twin", range: a }], "AUD"))!;
    expect(fx.consolidated).toEqual({ currency: "AUD", converted: true });
    const rev = fx.rows.find((r) => r.key === "revenue")!;
    expect(dec(rev.total!).toFixed(4)).toBe(dec(rev.values[0]!).times("2.65").toFixed(4)); // AUD + EUR × 1.65 (same data)
    // A gap longer than the 7-day fallback leaves no consolidated total, with the reason; never 1:1.
    const gap = rates.filter((r) => r.date < "2026-09-10" || r.date > "2026-09-20");
    const noFx = (await new ReportingService(withRates(gap)).storeComparison([{ storeId: "demo", range: a }, { storeId: "twin", range: a }], "AUD"))!;
    expect(noFx.consolidated).toMatchObject({ currency: null, reason: expect.stringContaining("EUR→AUD on 4 days") });
    expect(noFx.rows.every((r) => r.total === null)).toBe(true);
    expect(await service.storeComparison([{ storeId: "demo", range: a }, { storeId: "nope", range: a }])).toBeNull();
  });

  it("customer analytics agree with the daily components and the order list", async () => {
    const range = { start: "2026-09-01", end: "2026-09-30" };
    const c = (await service.customers("demo", range))!;
    const totals = sumComponents(await source.getDailyComponents("demo", range));
    expect(c.period.newCustomers).toBe(totals.newCustomers);
    expect(c.period.orders).toBe(totals.ordersCount);
    expect(dec(c.period.revenueNew).plus(dec(c.period.revenueReturning)).plus(dec(c.period.revenueGuests)).toFixed(6)).toBe(totals.revenue.toFixed(6));
    expect(c.period.returningCustomers).toBeGreaterThan(0);
    expect(dec(c.period.cac!).toFixed(6)).toBe(totals.adSpend.div(totals.newCustomers).toFixed(6));
    expect(c.history).toEqual({ start: DEMO_STORE.historyStart, complete: true });
    // Cohorts: the 12 months ending in September; everyone in a cohort ordered in its first month.
    expect(c.cohorts).toHaveLength(12);
    expect(c.cohorts.at(-1)!.month).toBe("2026-09");
    for (const cohort of c.cohorts) expect(dec(cohort.cells[0]!.retention).toFixed(2)).toBe("1.00");
    const all = (await service.customers("demo", { start: DEMO_STORE.historyStart, end: "2026-10-18" }))!;
    const life = sumComponents(await source.getDailyComponents("demo", { start: DEMO_STORE.historyStart, end: "2026-10-18" }));
    expect(all.toDate.customers).toBe(life.newCustomers);
    expect(dec(all.toDate.revenuePerCustomer!).toFixed(6)).toBe(life.revenue.div(all.toDate.customers).toFixed(6));
  });

  it("advertising: campaigns add up to the ad spend, UTM groups to the revenue, platform values stay separate", async () => {
    const range = { start: "2026-09-01", end: "2026-09-30" };
    const r = (await service.advertising("demo", range))!;
    const totals = sumComponents(await source.getDailyComponents("demo", range));
    const spend = sum(r.campaigns.map((c) => dec(c.spend!)));
    expect(spend.plus(dec(r.totals.otherAdSpend)).toFixed(6)).toBe(totals.adSpend.toFixed(6));
    expect(dec(r.totals.otherAdSpend).isZero()).toBe(true); // the demo has no expenses flagged as ad spend
    const utmRevenue = sum([...r.campaigns.map((c) => dec(c.utmRevenue ?? "0")), ...r.unattributed.map((g) => dec(g.revenue))]);
    expect(utmRevenue.toFixed(6)).toBe(totals.revenue.toFixed(6));
    const brand = r.campaigns.find((c) => c.campaignName === "Search - Brand")!;
    expect(brand.utmOrders).toBeGreaterThan(0);
    expect(dec(brand.utmRoas!).toFixed(6)).toBe(dec(brand.utmRevenue!).div(dec(brand.spend!)).toFixed(6));
    // Meta is manual spend without campaigns: UTM figures do not apply and its traffic is reported, not guessed.
    expect(r.campaigns.find((c) => c.platform === "meta")).toMatchObject({ attributable: false, utmOrders: null, utmRoas: null });
    expect(r.unattributed.map((g) => g.reason)).toEqual(expect.arrayContaining(["no_utm", "not_paid_platform", "no_campaign_data", "no_matching_campaign"]));
    expect(r.totals.breakEvenRoas).not.toBeNull();
    const google = (await source.getAdSpendByChannel("demo", range)).find((c) => c.channel === "google_ads")!;
    expect(dec(r.totals.platformValue!).toFixed(6)).toBe(dec(google.platformConversionValue!).toFixed(6));
  });

  it("products: allocated ad spend sums exactly to the store's, per method; product detail agrees with the list", async () => {
    const range = { start: "2026-09-01", end: "2026-09-30" };
    const adSpend = sumComponents(await source.getDailyComponents("demo", range)).adSpend;
    for (const method of ["revenue", "units"] as const) {
      const r = (await service.products("demo", range, method))!;
      expect(sum(r.rows.map((x) => dec(x.allocatedAdSpend!))).toFixed(6)).toBe(adSpend.toFixed(6));
      expect(r.allocation).toMatchObject({ method, adSpend: adSpend.toFixed(6) });
    }
    expect((await service.products("demo", range, null))!.rows.every((x) => x.allocatedAdSpend === null)).toBe(true);

    const list = (await service.products("demo", range, "revenue"))!.rows.filter((x) => x.productTitle === "Trail Runner Sneaker");
    const d = (await service.productDetail("demo", list[0]!.productId, range))!;
    expect(d.variants).toHaveLength(list.length);
    expect(d.series).toHaveLength(30);
    expect(dec(d.totals.netSales).toFixed(6)).toBe(sum(list.map((x) => dec(x.netSales))).toFixed(6));
    // The daily series adds up to the same totals (units, net sales, gross profit).
    expect(d.series.reduce((n, p) => n + p.unitsSold, 0)).toBe(d.totals.unitsSold);
    expect(sum(d.series.map((p) => dec(p.netSales))).toFixed(6)).toBe(dec(d.totals.netSales).toFixed(6));
    expect(sum(d.series.map((p) => dec(p.grossProfit))).toFixed(6)).toBe(dec(d.totals.grossProfit).toFixed(6));
    const byRevenue = d.allocations.find((a) => a.method === "revenue")!;
    expect(dec(byRevenue.allocated).toFixed(6)).toBe(sum(list.map((x) => dec(x.allocatedAdSpend!))).toFixed(6));
    expect(dec(byRevenue.profitAfterAds).toFixed(6)).toBe(dec(d.totals.grossProfit).minus(dec(byRevenue.allocated)).toFixed(6));
    expect(await service.productDetail("demo", "nope", range)).toBeNull();
  });

  it("returns null for unknown stores", async () => {
    expect(await service.dashboard("nope", { start: "2026-10-01", end: "2026-10-02" }, "none")).toBeNull();
  });
});
