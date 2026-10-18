import { dec, sum, sumComponents, ZERO } from "@profitlens/finance";
import { describe, expect, it } from "vitest";
import { DemoDataSource, DEMO_STORE } from "../src/demo/index";
import { ReportingService } from "../src/index";

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

  it("returns null for unknown stores", async () => {
    expect(await service.dashboard("nope", { start: "2026-10-01", end: "2026-10-02" }, "none")).toBeNull();
  });
});
