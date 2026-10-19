import { TZDate } from "@date-fns/tz";
import { addDays, dec, Decimal, eachDay, roundToMinor, todayIn, ZERO, type LocalDate } from "@profitlens/finance";
import { DEMO_CATALOG, DEMO_RULES, DEMO_STORE, type DemoVariant } from "./catalog";

/**
 * Deterministic generator for the demo store. Every value derives from a seeded PRNG keyed by date,
 * so the same day always produces the same orders. Nothing here is ever written to the database.
 */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG; returns floats in [0, 1). Used only for synthetic shape, never for money maths. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoLine {
  readonly variant: DemoVariant;
  readonly quantity: number;
  readonly unitPrice: Decimal;
  readonly discount: Decimal; // total discount on the line
  readonly unitCost: Decimal | null; // effective on the order date; null = missing
}

export interface DemoRefund {
  readonly at: Date;
  readonly localDate: LocalDate;
  readonly lines: readonly { readonly lineIndex: number; readonly quantity: number; readonly restock: "RETURN" | "NO_RESTOCK" }[];
  readonly shippingRefund: Decimal;
}

export interface DemoChargeback {
  readonly at: Date;
  readonly localDate: LocalDate;
  readonly amount: Decimal;
  readonly fee: Decimal;
}

export interface DemoOrder {
  readonly id: string;
  readonly name: string;
  readonly processedAt: Date;
  readonly localDate: LocalDate;
  readonly lines: readonly DemoLine[];
  readonly shippingCharged: Decimal;
  readonly tip: Decimal;
  readonly isNewCustomer: boolean;
  /** Synthetic customer id (no personal data); assigned in order sequence by generateDemoHistory. */
  readonly customerId: string;
  readonly refund: DemoRefund | null;
  readonly chargeback: DemoChargeback | null;
}

/** Signed money effect of one dated event (ORDER, RETURN or CHARGEBACK). */
export interface DemoEvent {
  readonly orderId: string;
  readonly kind: "order" | "return" | "chargeback";
  readonly at: Date;
  readonly localDate: LocalDate;
  readonly grossSales: Decimal;
  readonly discounts: Decimal;
  readonly returns: Decimal;
  readonly shippingCharged: Decimal;
  readonly tips: Decimal;
  readonly taxes: Decimal;
  readonly giftCardSales: Decimal;
  readonly cogs: Decimal;
  readonly shippingCost: Decimal;
  readonly transactionFees: Decimal;
  readonly chargebackLoss: Decimal;
  readonly chargebackFees: Decimal;
  readonly variableExpenses: Decimal;
  readonly units: number;
  readonly orders: number;
  readonly newCustomers: number;
  readonly missingCogs: boolean;
  readonly revenueMissingCogs: Decimal;
}

const pct = (p: string) => dec(p).div(100);
/** Converts a synthetic random factor to Decimal via a fixed 4-dp string (no float arithmetic on money). */
const factor = (x: number) => dec(x.toFixed(4));

export function unitCostOn(variant: DemoVariant, date: LocalDate): Decimal | null {
  let cost: string | null = null;
  for (const c of variant.costs) if (c.from <= date) cost = c.unitCost;
  return cost === null ? null : dec(cost);
}

function pickVariant(rand: () => number): DemoVariant {
  const pool = DEMO_CATALOG.filter((x) => !x.isGiftCard);
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const x of pool) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return pool[pool.length - 1]!;
}

function ordersForDay(date: LocalDate, rand: () => number): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekday = [1.12, 1.04, 0.98, 0.96, 1.0, 0.94, 0.9][dow]!;
  const month = Number(date.slice(5, 7));
  const seasonal = month === 11 ? 1.45 : month === 12 ? 1.3 : month === 1 ? 0.85 : 1;
  const daysSinceStart = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DEMO_STORE.historyStart}T00:00:00Z`)) / 86_400_000;
  const trend = 1 + daysSinceStart * 0.0006;
  return Math.max(0, Math.round(26 * weekday * seasonal * trend * (0.82 + rand() * 0.36)));
}

/** Local wall-clock time in the store timezone → UTC instant. */
function localInstant(date: LocalDate, minutesOfDay: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, Math.floor(minutesOfDay / 60), minutesOfDay % 60, DEMO_STORE.timezone).getTime());
}

function randomMinutes(rand: () => number): number {
  // Busier in the evening: blend of two uniform windows.
  return rand() < 0.65 ? Math.floor(1080 + rand() * 330) : Math.floor(420 + rand() * 660);
}

function generateDay(date: LocalDate, firstNumber: number): DemoOrder[] {
  const rand = prng(hashString(`${DEMO_STORE.id}:${date}`));
  const count = ordersForDay(date, rand);
  const minutes = Array.from({ length: count }, () => randomMinutes(rand)).sort((a, b) => a - b);
  const orders: DemoOrder[] = [];
  for (let i = 0; i < count; i++) {
    const number = firstNumber + i;
    const processedAt = localInstant(date, minutes[i]!);
    const lines: DemoLine[] = [];
    if (rand() < 0.012) {
      const gift = DEMO_CATALOG.find((x) => x.isGiftCard)!;
      lines.push({ variant: gift, quantity: 1, unitPrice: dec(gift.price), discount: ZERO, unitCost: ZERO });
    } else {
      const lineCount = rand() < 0.62 ? 1 : rand() < 0.75 ? 2 : 3;
      const discountRate = rand() < 0.22 ? (rand() < 0.5 ? "0.10" : "0.15") : "0";
      const used = new Set<string>();
      for (let l = 0; l < lineCount; l++) {
        const variant = pickVariant(rand);
        if (used.has(variant.id)) continue;
        used.add(variant.id);
        const quantity = rand() < 0.85 ? 1 : 2;
        const unitPrice = dec(variant.price);
        const discount = roundToMinor(unitPrice.times(quantity).times(discountRate), DEMO_STORE.currency);
        lines.push({ variant, quantity, unitPrice, discount, unitCost: unitCostOn(variant, date) });
      }
    }
    const productNet = lines
      .filter((l) => !l.variant.isGiftCard)
      .reduce((s, l) => s.plus(l.unitPrice.times(l.quantity)).minus(l.discount), ZERO);
    const shippable = lines.some((l) => !l.variant.isGiftCard);
    const shippingCharged = shippable && productNet.lt(DEMO_RULES.freeShippingThreshold) ? dec(DEMO_RULES.shippingCharge) : ZERO;
    const tip = rand() < 0.03 ? dec("5.00") : ZERO;
    const isNewCustomer = rand() < 0.62;

    let refund: DemoRefund | null = null;
    const refundRoll = rand();
    if (refundRoll < 0.06 && shippable) {
      const delay = 3 + Math.floor(rand() * 18);
      const refundDate = addDays(date, delay);
      const full = refundRoll < 0.035;
      const refundLines = lines
        .map((l, lineIndex) => ({ l, lineIndex }))
        .filter(({ l }) => !l.variant.isGiftCard)
        .filter((_, idx) => full || idx === 0)
        .map(({ l, lineIndex }) => ({
          lineIndex,
          quantity: full ? l.quantity : 1,
          restock: rand() < 0.8 ? ("RETURN" as const) : ("NO_RESTOCK" as const),
        }));
      refund = {
        at: localInstant(refundDate, 600 + Math.floor(rand() * 420)),
        localDate: refundDate,
        lines: refundLines,
        shippingRefund: full ? shippingCharged : ZERO,
      };
    }

    let chargeback: DemoChargeback | null = null;
    if (!refund && rand() < 0.004) {
      const resolved = addDays(date, 25 + Math.floor(rand() * 20));
      chargeback = {
        at: localInstant(resolved, 720),
        localDate: resolved,
        amount: productNet
          .plus(shippingCharged)
          .plus(roundToMinor(productNet.plus(shippingCharged).times(pct(DEMO_RULES.taxRatePercent)), DEMO_STORE.currency))
          .plus(tip),
        fee: dec(DEMO_RULES.chargebackFee),
      };
    }

    orders.push({
      id: `demo-o-${number}`,
      name: `#${number}`,
      processedAt,
      localDate: date,
      lines,
      shippingCharged,
      tip,
      isNewCustomer,
      customerId: "",
      refund,
      chargeback,
    });
  }
  return orders;
}

const emptyEvent = (orderId: string, kind: DemoEvent["kind"], at: Date, localDate: LocalDate): DemoEvent => ({
  orderId, kind, at, localDate,
  grossSales: ZERO, discounts: ZERO, returns: ZERO, shippingCharged: ZERO, tips: ZERO, taxes: ZERO, giftCardSales: ZERO,
  cogs: ZERO, shippingCost: ZERO, transactionFees: ZERO, chargebackLoss: ZERO, chargebackFees: ZERO, variableExpenses: ZERO,
  units: 0, orders: 0, newCustomers: 0, missingCogs: false, revenueMissingCogs: ZERO,
});

/** Splits an order into its dated money events, following FINANCIAL_MODEL §4–5 semantics. */
export function orderEvents(o: DemoOrder): DemoEvent[] {
  const tax = pct(DEMO_RULES.taxRatePercent);
  const products = o.lines.filter((l) => !l.variant.isGiftCard);
  const gifts = o.lines.filter((l) => l.variant.isGiftCard);
  const grossSales = products.reduce((s, l) => s.plus(l.unitPrice.times(l.quantity)), ZERO);
  const discounts = products.reduce((s, l) => s.plus(l.discount), ZERO);
  const giftCardSales = gifts.reduce((s, l) => s.plus(l.unitPrice.times(l.quantity)), ZERO);
  const taxes = roundToMinor(grossSales.minus(discounts).plus(o.shippingCharged).times(tax), DEMO_STORE.currency);
  const units = products.reduce((s, l) => s + l.quantity, 0);
  const missing = products.filter((l) => l.unitCost === null);
  const cogs = products.reduce((s, l) => s.plus(l.unitCost === null ? ZERO : l.unitCost.times(l.quantity)), ZERO);
  const shippingCost = units === 0 ? ZERO : dec(DEMO_RULES.shippingCostFirst).plus(dec(DEMO_RULES.shippingCostAdditional).times(units - 1));
  const charged = grossSales.minus(discounts).plus(o.shippingCharged).plus(taxes).plus(o.tip).plus(giftCardSales);
  const fee = roundToMinor(charged.times(pct(DEMO_RULES.feePercent)).plus(DEMO_RULES.feeFixed), DEMO_STORE.currency, Decimal.ROUND_HALF_UP);

  const events: DemoEvent[] = [
    {
      ...emptyEvent(o.id, "order", o.processedAt, o.localDate),
      grossSales, discounts, shippingCharged: o.shippingCharged, tips: o.tip, taxes, giftCardSales, cogs, shippingCost,
      transactionFees: fee, variableExpenses: units > 0 ? dec(DEMO_RULES.packagingPerOrder) : ZERO,
      units, orders: 1, newCustomers: o.isNewCustomer ? 1 : 0,
      missingCogs: missing.length > 0,
      revenueMissingCogs: missing.reduce((s, l) => s.plus(l.unitPrice.times(l.quantity)).minus(l.discount), ZERO),
    },
  ];

  if (o.refund) {
    let returns = ZERO;
    let cogsReversal = ZERO;
    let units = 0;
    for (const rl of o.refund.lines) {
      const line = o.lines[rl.lineIndex]!;
      const perUnitNet = line.unitPrice.minus(line.discount.div(line.quantity));
      returns = returns.plus(perUnitNet.times(rl.quantity));
      units += rl.quantity;
      if (rl.restock === "RETURN" && line.unitCost !== null) cogsReversal = cogsReversal.plus(line.unitCost.times(rl.quantity));
    }
    returns = roundToMinor(returns, DEMO_STORE.currency);
    events.push({
      ...emptyEvent(o.id, "return", o.refund.at, o.refund.localDate),
      returns,
      shippingCharged: o.refund.shippingRefund.negated(),
      taxes: roundToMinor(returns.plus(o.refund.shippingRefund).times(tax), DEMO_STORE.currency).negated(),
      cogs: cogsReversal.negated(),
      units: -units,
    });
  }

  if (o.chargeback) {
    events.push({
      ...emptyEvent(o.id, "chargeback", o.chargeback.at, o.chargeback.localDate),
      chargebackLoss: o.chargeback.amount,
      chargebackFees: o.chargeback.fee,
    });
  }
  return events;
}

/** Revenue of an event (FINANCIAL_MODEL §4, default policy: tips included; tax and gift cards excluded). */
export function eventRevenue(e: DemoEvent): Decimal {
  return e.grossSales.minus(e.discounts).minus(e.returns).plus(e.shippingCharged).plus(e.tips);
}

export interface DemoHistory {
  readonly orders: readonly DemoOrder[];
  readonly ordersById: ReadonlyMap<string, DemoOrder>;
  /** Events keyed by local date (only events that have happened by `now`). */
  readonly eventsByDate: ReadonlyMap<LocalDate, readonly DemoEvent[]>;
  readonly today: LocalDate;
  readonly generatedAt: Date;
  readonly customerFirstDate: ReadonlyMap<string, LocalDate>;
}

/** Generates the full history from DEMO_STORE.historyStart through today (store timezone). */
export function generateDemoHistory(now: Date = new Date()): DemoHistory {
  const today = todayIn(DEMO_STORE.timezone, now);
  const orders: DemoOrder[] = [];
  let next = 1001;
  // Customers come from their own stream so that adding them never shifts any other generated value.
  const customerRand = prng(hashString(`${DEMO_STORE.id}:customers`));
  const customers: string[] = [];
  const customerFirstDate = new Map<string, LocalDate>();
  for (const date of eachDay({ start: DEMO_STORE.historyStart, end: today })) {
    const day = generateDay(date, next).filter((o) => o.processedAt <= now);
    next += day.length;
    for (const o of day) {
      // The very first order cannot be from a returning customer.
      const isNewCustomer = o.isNewCustomer || customers.length === 0;
      let customerId: string;
      if (isNewCustomer) {
        customerId = `demo-c-${customers.length + 1}`;
        customers.push(customerId);
        customerFirstDate.set(customerId, o.localDate);
      } else {
        // Returning: an earlier customer, biased towards recent ones (√ of a uniform draw).
        customerId = customers[Math.min(customers.length - 1, Math.floor(customers.length * Math.sqrt(customerRand())))]!;
      }
      orders.push({ ...o, customerId, isNewCustomer });
    }
  }
  const eventsByDate = new Map<LocalDate, DemoEvent[]>();
  for (const o of orders) {
    for (const e of orderEvents(o)) {
      if (e.at > now) continue; // refunds/chargebacks that haven't happened yet
      const list = eventsByDate.get(e.localDate);
      if (list) list.push(e);
      else eventsByDate.set(e.localDate, [e]);
    }
  }
  return { orders, ordersById: new Map(orders.map((o) => [o.id, o])), eventsByDate, today, generatedAt: now, customerFirstDate };
}

/** Ad spend per channel for a day: a share of that day's revenue with noise (synthetic). */
export function demoAdSpend(date: LocalDate, revenue: Decimal): { google: Decimal; googleValue: Decimal; meta: Decimal } {
  const rand = prng(hashString(`${DEMO_STORE.id}:ads:${date}`));
  const google = roundToMinor(revenue.times(factor(0.13 + rand() * 0.06)).plus(35), DEMO_STORE.currency);
  const meta = roundToMinor(revenue.times(factor(0.07 + rand() * 0.05)).plus(20), DEMO_STORE.currency);
  const googleValue = roundToMinor(google.times(factor(2.6 + rand() * 1.4)), DEMO_STORE.currency);
  return { google, googleValue, meta };
}

/**
 * Last-visit UTM parameters of a demo order (synthetic, from its own stream keyed by order id). Mirrors what real
 * stores see: tagged Google campaigns by name or by {campaignid}, Meta traffic, email, an ended campaign, and
 * many orders without UTMs.
 */
export function demoUtm(orderId: string): { source: string | null; medium: string | null; campaign: string | null } {
  const r = prng(hashString(`${DEMO_STORE.id}:utm:${orderId}`))();
  if (r < 0.08) return { source: "google", medium: "cpc", campaign: "Search - Brand" };
  if (r < 0.2) return { source: "google", medium: "cpc", campaign: "shopping - all products" };
  if (r < 0.27) return { source: "google", medium: "cpc", campaign: "20431003" };
  if (r < 0.29) return { source: "google", medium: "cpc", campaign: "Winter clearance" };
  if (r < 0.39) return { source: "facebook", medium: "paid_social", campaign: "Prospecting - Broad" };
  if (r < 0.43) return { source: "instagram", medium: "paid_social", campaign: "Retargeting - 30d" };
  if (r < 0.5) return { source: "newsletter", medium: "email", campaign: "Weekly edit" };
  return { source: null, medium: null, campaign: null };
}
