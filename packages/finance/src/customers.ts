import type { DateRange, LocalDate } from "./dates";
import { Decimal, moneyPart, MoneySum, ratio, type MoneyString } from "./money";

/**
 * Customer activity on one store-local day: the customer's orders placed that day and the event-dated money
 * of all their orders on that day (refunds reduce it on the day they happen). `customerId` null groups orders
 * without a customer record (guest checkouts), which are excluded from customer metrics and only counted.
 */
export interface CustomerActivityRow {
  readonly customerId: string | null;
  /** The customer's first order date (store-local). Null for guest rows. */
  readonly firstOrderDate: LocalDate | null;
  readonly date: LocalDate;
  readonly ordersPlaced: number;
  readonly revenue: MoneyString;
  readonly cogs: MoneyString;
  readonly revenueMissingCogs: MoneyString;
}

export interface CohortCell {
  /** Months since the cohort's first-order month (0 = that month). */
  readonly offset: number;
  /** Customers of the cohort who placed an order in this month. */
  readonly activeCustomers: number;
  /** Σ revenue of the cohort through the end of this month ÷ cohort size. */
  readonly cumulativeRevenuePerCustomer: Decimal;
  /** Σ (revenue − COGS) of the cohort through the end of this month ÷ cohort size. */
  readonly cumulativeGrossProfitPerCustomer: Decimal;
  /** The month is still running (it contains `asOf`). */
  readonly partial: boolean;
}

export interface Cohort {
  readonly month: string; // YYYY-MM
  readonly customers: number;
  readonly cells: readonly CohortCell[];
  /** Revenue of the cohort's orders whose products have no cost: its gross profit is overstated by their COGS. */
  readonly revenueMissingCogs: Decimal;
}

export interface CustomerAnalytics {
  readonly period: {
    /** Customers who placed at least one order in the range. */
    readonly customers: number;
    /** Customers whose first order is in the range. */
    readonly newCustomers: number;
    /** Customers who ordered in the range and had ordered before it. */
    readonly returningCustomers: number;
    readonly returningRate: Decimal | null;
    readonly orders: number;
    readonly ordersPerCustomer: Decimal | null;
    /** Event-dated revenue in the range from new / returning customers (and from guest orders). */
    readonly revenueNew: Decimal;
    readonly revenueReturning: Decimal;
    readonly revenueGuests: Decimal;
    readonly guestOrders: number;
  };
  /** Everything observed from the start of history to the end of the range. */
  readonly toDate: {
    readonly customers: number;
    /** Customers with two or more orders. */
    readonly repeatCustomers: number;
    readonly repeatRate: Decimal | null;
    readonly ordersPerCustomer: Decimal | null;
    /** Observed LTV: revenue to date ÷ customers (no prediction). */
    readonly revenuePerCustomer: Decimal | null;
    /** Observed LTV on gross profit: (revenue − COGS) to date ÷ customers. */
    readonly grossProfitPerCustomer: Decimal | null;
    readonly revenueMissingCogs: Decimal;
    readonly revenue: Decimal;
  };
  readonly cohorts: readonly Cohort[];
}

const monthOf = (d: LocalDate) => d.slice(0, 7);
function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}
function monthFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
function isMonthEnd(d: LocalDate): boolean {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate() === day;
}

/**
 * Customer metrics for `range` plus first-order-month cohorts (the `cohortMonths` months ending with the range's
 * last month). Every figure is observed from stored orders up to `range.end`; nothing is predicted. Rows after
 * `range.end` are ignored, so the caller may pass more.
 */
export function customerAnalytics(rows: readonly CustomerActivityRow[], range: DateRange, cohortMonths = 12): CustomerAnalytics {
  const inRange = (d: LocalDate) => d >= range.start && d <= range.end;
  const lastMonth = monthIndex(monthOf(range.end));
  const firstCohort = lastMonth - cohortMonths + 1;

  // Sums use MoneySum (exact integer micro-units): a store with 100k orders has ~100k activity rows.
  interface Acc {
    first: LocalDate;
    orders: number;
    revenue: MoneySum;
    cogs: MoneySum;
    missing: MoneySum;
    activeInRange: boolean;
    revenueInRange: MoneySum;
    ordersInRange: number;
    months: Map<number, { orders: number; revenue: MoneySum; cogs: MoneySum }>;
  }
  const customers = new Map<string, Acc>();
  let guestOrders = 0;
  const revenueGuests = new MoneySum();

  for (const r of rows) {
    if (r.date > range.end) continue;
    if (r.customerId === null || r.firstOrderDate === null) {
      if (inRange(r.date)) {
        guestOrders += r.ordersPlaced;
        revenueGuests.add(r.revenue);
      }
      continue;
    }
    let c = customers.get(r.customerId);
    if (!c) {
      c = { first: r.firstOrderDate, orders: 0, revenue: new MoneySum(), cogs: new MoneySum(), missing: new MoneySum(), activeInRange: false, revenueInRange: new MoneySum(), ordersInRange: 0, months: new Map() };
      customers.set(r.customerId, c);
    }
    const revenue = moneyPart(r.revenue);
    const cogs = moneyPart(r.cogs);
    c.orders += r.ordersPlaced;
    c.revenue.add(revenue);
    c.cogs.add(cogs);
    c.missing.add(r.revenueMissingCogs);
    if (inRange(r.date)) {
      c.revenueInRange.add(revenue);
      c.ordersInRange += r.ordersPlaced;
      if (r.ordersPlaced > 0) c.activeInRange = true;
    }
    const mi = monthIndex(monthOf(r.date));
    if (mi < firstCohort) continue; // months before the cohort window are never read
    let mo = c.months.get(mi);
    if (!mo) c.months.set(mi, (mo = { orders: 0, revenue: new MoneySum(), cogs: new MoneySum() }));
    mo.orders += r.ordersPlaced;
    mo.revenue.add(revenue);
    mo.cogs.add(cogs);
  }

  let active = 0;
  let newCustomers = 0;
  let orders = 0;
  const revenueNew = new MoneySum();
  const revenueReturning = new MoneySum();
  let repeat = 0;
  let ordersToDate = 0;
  const revenueToDate = new MoneySum();
  const cogsToDate = new MoneySum();
  const missingToDate = new MoneySum();
  const cohortMembers = new Map<number, Acc[]>();

  for (const c of customers.values()) {
    const isNew = inRange(c.first);
    if (c.activeInRange) {
      active++;
      if (isNew) newCustomers++;
    }
    orders += c.ordersInRange;
    // Revenue in the range is "new" when it comes from a customer whose first order is in the range.
    (isNew ? revenueNew : revenueReturning).add(c.revenueInRange);
    if (c.orders >= 2) repeat++;
    ordersToDate += c.orders;
    revenueToDate.add(c.revenue);
    cogsToDate.add(c.cogs);
    missingToDate.add(c.missing);
    const cm = monthIndex(monthOf(c.first));
    if (cm >= firstCohort && cm <= lastMonth) {
      const list = cohortMembers.get(cm);
      if (list) list.push(c);
      else cohortMembers.set(cm, [c]);
    }
  }

  const n = new Decimal(customers.size);
  const endPartial = !isMonthEnd(range.end);
  const cohorts: Cohort[] = [];
  for (let cm = firstCohort; cm <= lastMonth; cm++) {
    const members = cohortMembers.get(cm) ?? [];
    if (members.length === 0) continue;
    const size = new Decimal(members.length);
    const cells: CohortCell[] = [];
    const cumRevenue = new MoneySum();
    const cumCogs = new MoneySum();
    for (let mi = cm; mi <= lastMonth; mi++) {
      let activeCustomers = 0;
      for (const c of members) {
        const mo = c.months.get(mi);
        if (!mo) continue;
        cumRevenue.add(mo.revenue);
        cumCogs.add(mo.cogs);
        if (mo.orders > 0) activeCustomers++;
      }
      const revenue = cumRevenue.value();
      cells.push({
        offset: mi - cm,
        activeCustomers,
        cumulativeRevenuePerCustomer: revenue.div(size),
        cumulativeGrossProfitPerCustomer: revenue.minus(cumCogs.value()).div(size),
        partial: mi === lastMonth && endPartial,
      });
    }
    cohorts.push({ month: monthFromIndex(cm), customers: members.length, cells, revenueMissingCogs: members.reduce((sum, c) => sum.add(c.missing), new MoneySum()).value() });
  }

  return {
    period: {
      customers: active,
      newCustomers,
      returningCustomers: active - newCustomers,
      returningRate: ratio(new Decimal(active - newCustomers), new Decimal(active)),
      orders,
      ordersPerCustomer: ratio(new Decimal(orders), new Decimal(active)),
      revenueNew: revenueNew.value(),
      revenueReturning: revenueReturning.value(),
      revenueGuests: revenueGuests.value(),
      guestOrders,
    },
    toDate: {
      customers: customers.size,
      repeatCustomers: repeat,
      repeatRate: ratio(new Decimal(repeat), n),
      ordersPerCustomer: ratio(new Decimal(ordersToDate), n),
      revenuePerCustomer: ratio(revenueToDate.value(), n),
      grossProfitPerCustomer: ratio(revenueToDate.value().minus(cogsToDate.value()), n),
      revenueMissingCogs: missingToDate.value(),
      revenue: revenueToDate.value(),
    },
    cohorts,
  };
}
