import { describe, expect, it } from "vitest";
import { customerAnalytics, type CustomerActivityRow } from "../src/index";

const row = (customerId: string | null, firstOrderDate: string | null, date: string, ordersPlaced: number, revenue: string, cogs = "0", revenueMissingCogs = "0"): CustomerActivityRow => ({
  customerId,
  firstOrderDate,
  date,
  ordersPlaced,
  revenue,
  cogs,
  revenueMissingCogs,
});

// A: first order in Aug, again in Oct (refund later in Oct). B: first order in Oct. C: Aug only. Guest in Oct.
const rows = [
  row("A", "2026-08-10", "2026-08-10", 1, "100", "40"),
  row("A", "2026-08-10", "2026-10-05", 1, "60", "20"),
  row("A", "2026-08-10", "2026-10-09", 0, "-30", "-10"), // refund of the October order
  row("B", "2026-10-02", "2026-10-02", 2, "90", "0", "90"), // two orders the same day, no costs
  row("C", "2026-08-20", "2026-08-20", 1, "50", "25"),
  row(null, null, "2026-10-03", 3, "75"),
  row("D", "2026-10-25", "2026-10-25", 1, "999", "1"), // after the range: ignored
];
const october = { start: "2026-10-01", end: "2026-10-15" };

describe("customer analytics", () => {
  it("splits the period into new and returning customers, guests counted separately", () => {
    const a = customerAnalytics(rows, october, 6);
    expect(a.period).toMatchObject({ customers: 2, newCustomers: 1, returningCustomers: 1, orders: 3, guestOrders: 3 });
    expect(a.period.returningRate!.toString()).toBe("0.5");
    expect(a.period.ordersPerCustomer!.toString()).toBe("1.5");
    expect(a.period.revenueNew.toString()).toBe("90");
    expect(a.period.revenueReturning.toString()).toBe("30"); // 60 − 30 refund
    expect(a.period.revenueGuests.toString()).toBe("75");
  });

  it("reports observed lifetime figures to the end of the range, never later", () => {
    const t = customerAnalytics(rows, october, 6).toDate;
    expect(t.customers).toBe(3);
    expect(t.repeatCustomers).toBe(2); // A (2 orders) and B (2 orders on one day)
    expect(t.repeatRate!.toFixed(4)).toBe("0.6667");
    expect(t.revenue.toString()).toBe("270");
    expect(t.revenuePerCustomer!.toString()).toBe("90");
    expect(t.grossProfitPerCustomer!.toString()).toBe("65"); // (270 − COGS 75) ÷ 3, the refund reverses 10 of COGS
    expect(t.revenueMissingCogs.toString()).toBe("90");
  });

  it("builds cumulative first-order-month cohorts with retention", () => {
    const a = customerAnalytics(rows, october, 6);
    expect(a.cohorts.map((c) => [c.month, c.customers])).toEqual([
      ["2026-08", 2],
      ["2026-10", 1],
    ]);
    const aug = a.cohorts[0]!;
    expect(aug.cells.map((c) => c.offset)).toEqual([0, 1, 2]);
    expect(aug.cells.map((c) => c.activeCustomers)).toEqual([2, 0, 1]);
    expect(aug.cells.map((c) => c.cumulativeRevenuePerCustomer.toString())).toEqual(["75", "75", "90"]);
    expect(aug.cells.map((c) => c.partial)).toEqual([false, false, true]);
    expect(a.cohorts[1]!.revenueMissingCogs.toString()).toBe("90");
    // Cohorts outside the window are left out.
    expect(customerAnalytics(rows, october, 1).cohorts.map((c) => c.month)).toEqual(["2026-10"]);
  });

  it("returns null ratios when there are no customers", () => {
    const a = customerAnalytics([], october);
    expect(a.period.returningRate).toBeNull();
    expect(a.toDate.revenuePerCustomer).toBeNull();
    expect(a.cohorts).toEqual([]);
  });
});
