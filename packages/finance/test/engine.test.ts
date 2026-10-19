import { describe, expect, it } from "vitest";
import {
  allocateExpenses,
  computeOrderProfit,
  dec,
  DEFAULT_POLICY,
  fxLookupFrom,
  ORDER_COUNT_PARTS,
  ORDER_MONEY_PARTS,
  toMoneyString,
  type EngineSale,
  type ExpenseBase,
  type ExpenseDay,
  type ExpenseInput,
  type FinancialPolicy,
  type OrderCostContext,
  type OrderInput,
} from "../src/index";

// ------------------------------------------------------------------ builders

const m = (v: { toFixed(n: number): string }) => v.toFixed(2);

function sale(p: Partial<EngineSale> & Pick<EngineSale, "gid" | "lineType" | "totalAmount">): EngineSale {
  return {
    agreementType: "OrderAgreement",
    refundGid: null,
    happenedLocalDate: "2026-03-10",
    actionType: "ORDER",
    lineItemGid: null,
    quantity: null,
    discountBeforeTaxes: "0",
    taxAmount: "0",
    ...p,
  };
}

const productSale = (gid: string, line: string, qty: number, total: string, extra: Partial<EngineSale> = {}) =>
  sale({ gid, lineType: "PRODUCT", lineItemGid: line, quantity: qty, totalAmount: total, ...extra });

function order(p: Partial<OrderInput> = {}): OrderInput {
  return {
    id: "o1",
    name: "#1001",
    currency: "AUD",
    localDate: "2026-03-10",
    test: false,
    financialStatus: "PAID",
    cancelled: false,
    fulfilled: true,
    shippingCountryCode: "AU",
    lines: [
      { gid: "L1", variantId: "V1", title: "Sneaker", quantity: 2, isGiftCard: false, requiresShipping: true },
      { gid: "L2", variantId: "V2", title: "Socks", quantity: 1, isGiftCard: false, requiresShipping: true },
    ],
    sales: [
      productSale("S1", "L1", 2, "180.00", { discountBeforeTaxes: "20.00" }), // 2 × 100 − 20 discount
      productSale("S2", "L2", 1, "25.00"),
      sale({ gid: "S3", lineType: "SHIPPING", totalAmount: "10.00" }),
    ],
    refunds: [],
    transactions: [
      { gid: "T1", parentGid: null, kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", manual: false, amount: "215.00", localDate: "2026-03-10", feeAmount: "4.06", feeTaxAmount: "0.41" },
    ],
    disputes: [],
    ...p,
  };
}

function ctx(p: Partial<OrderCostContext> = {}): OrderCostContext {
  return {
    storeCurrency: "AUD",
    thirdPartyFeeRate: "2",
    unitCosts: {
      V1: [{ id: "cv1", from: "2026-01-01", to: null, landed: "31.20", source: "manual" }],
      V2: [{ id: "cv2", from: "2026-01-01", to: null, landed: "4.50", source: "shopify_sync" }],
    },
    shippingRules: [
      { id: "sr1", name: "AU flat", type: "per_order", countryCodes: null, priority: 100, params: { type: "per_order", amount: "8.50" }, currency: "AUD", effectiveFrom: "2026-01-01", effectiveTo: null },
    ],
    handlingRules: [],
    gatewayRules: [],
    overrides: [],
    ...p,
  } as OrderCostContext;
}

const policy = (p: Partial<FinancialPolicy> = {}): FinancialPolicy => ({ ...DEFAULT_POLICY, ...p });
const day = (r: ReturnType<typeof computeOrderProfit>, d: string) => r.days.find((x) => x.localDate === d)!.parts;

// ------------------------------------------------------------------ tests

describe("order profit — revenue, COGS, shipping, fees (FINANCIAL_MODEL §4–5)", () => {
  const r = computeOrderProfit(order(), ctx(), policy());

  it("decomposes product sales into gross, discounts and net; shipping charged is separate revenue", () => {
    expect(m(r.totals.grossSales)).toBe("225.00");
    expect(m(r.totals.discounts)).toBe("20.00");
    expect(m(r.totals.returns)).toBe("0.00");
    expect(m(r.totals.shippingCharged)).toBe("10.00");
    expect(m(r.totals.revenue)).toBe("215.00");
    expect(r.totals.ordersCount).toBe(1);
    expect(r.totals.unitsSold).toBe(3);
  });

  it("costs: landed unit cost × qty, shipping rule (carrier cost ≠ shipping charged), actual fee + fee tax", () => {
    expect(m(r.totals.cogs)).toBe("66.90"); // 2 × 31.20 + 4.50
    expect(r.components.cogs.status).toBe("manual"); // worst of manual / actual
    expect(m(r.totals.shippingCost)).toBe("8.50");
    expect(r.components.shipping.status).toBe("rule");
    expect(m(r.totals.transactionFees)).toBe("4.47"); // fee tax counted as cost by default
    expect(m(computeOrderProfit(order(), ctx(), policy({ feeTaxRecoverable: true })).totals.transactionFees)).toBe("4.06");
    expect(m(r.contributionBeforeAds)).toBe("135.13"); // 215 − 66.90 − 8.50 − 4.47
    expect(r.completeness).toEqual({ complete: true, missing: [], estimated: [] });
  });

  it("lifetime totals equal the sum of the dated view, for every component", () => {
    for (const k of ORDER_MONEY_PARTS) expect(r.days.reduce((t, d) => t.plus(d.parts[k]), dec("0")).eq(r.totals[k])).toBe(true);
    for (const k of ORDER_COUNT_PARTS) expect(r.days.reduce((t, d) => t + d.parts[k], 0)).toBe(r.totals[k]);
  });

  it("is deterministic (same inputs → identical result, so re-processing a duplicate webhook changes nothing)", () => {
    expect(JSON.stringify(computeOrderProfit(order(), ctx(), policy()).trace)).toBe(JSON.stringify(r.trace));
  });

  it("splits an order-level discount across products exactly as the ledger reports it", () => {
    const o = order({
      sales: [productSale("S1", "L1", 2, "190.00", { discountBeforeTaxes: "10.00" }), productSale("S2", "L2", 1, "23.75", { discountBeforeTaxes: "1.25" })],
    });
    const x = computeOrderProfit(o, ctx(), policy());
    expect(m(x.totals.discounts)).toBe("11.25");
    expect(m(x.totals.grossSales)).toBe("225.00");
  });
});

describe("tax handling", () => {
  it("tax-exclusive: totalAmount includes added tax; taxes are a memo, never revenue", () => {
    const o = order({ sales: [productSale("S1", "L1", 2, "220.00", { taxAmount: "20.00" })] });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.grossSales)).toBe("200.00");
    expect(m(r.totals.taxes)).toBe("20.00");
    expect(m(r.totals.revenue)).toBe("200.00");
  });

  it("tax-inclusive (e.g. AU GST in price): net excludes the included tax", () => {
    const o = order({ sales: [productSale("S1", "L1", 2, "200.00", { taxAmount: "18.18" })] });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.grossSales)).toBe("181.82");
    expect(m(r.totals.revenue)).toBe("181.82");
  });
});

describe("refunds and returns", () => {
  const refunded = (restockType: "RETURN" | "NO_RESTOCK" | "CANCEL" | "LEGACY_RESTOCK", restocked = false) =>
    order({
      sales: [
        ...order().sales,
        productSale("R1", "L1", -1, "-90.00", { agreementType: "RefundAgreement", refundGid: "RF1", actionType: "RETURN", happenedLocalDate: "2026-04-02", discountBeforeTaxes: "-10.00" }),
      ],
      refunds: [{ gid: "RF1", localDate: "2026-04-02", lines: [{ lineItemGid: "L1", quantity: 1, restockType, restocked }] }],
      transactions: [...order().transactions, { gid: "T2", parentGid: "T1", kind: "REFUND", status: "SUCCESS", gateway: "shopify_payments", manual: false, amount: "90.00", localDate: "2026-04-02", feeAmount: null, feeTaxAmount: null }],
    });

  it("a late partial refund reduces revenue on the refund date and reverses COGS for returned goods", () => {
    const r = computeOrderProfit(refunded("RETURN"), ctx(), policy());
    const april = day(r, "2026-04-02");
    expect(m(april.returns)).toBe("90.00");
    expect(m(april.revenue)).toBe("-90.00");
    expect(m(april.cogs)).toBe("-31.20");
    expect(april.unitsSold).toBe(-1);
    expect(m(day(r, "2026-03-10").revenue)).toBe("215.00"); // the original day is not restated
    expect(m(r.totals.revenue)).toBe("125.00");
    expect(m(r.totals.transactionFees)).toBe("4.47"); // fees are kept by the processor by default
  });

  it("NO_RESTOCK keeps the cost (goods lost); LEGACY_RESTOCK follows the restocked flag", () => {
    expect(m(computeOrderProfit(refunded("NO_RESTOCK"), ctx(), policy()).totals.cogs)).toBe("66.90");
    expect(m(computeOrderProfit(refunded("CANCEL"), ctx(), policy()).totals.cogs)).toBe("35.70");
    expect(m(computeOrderProfit(refunded("LEGACY_RESTOCK", false), ctx(), policy()).totals.cogs)).toBe("66.90");
    expect(m(computeOrderProfit(refunded("LEGACY_RESTOCK", true), ctx(), policy()).totals.cogs)).toBe("35.70");
  });

  it("refundDating = order restates the refund onto the original order date", () => {
    const r = computeOrderProfit(refunded("RETURN"), ctx(), policy({ refundDating: "order" }));
    expect(r.days.map((d) => d.localDate)).toEqual(["2026-03-10"]);
    expect(m(r.totals.revenue)).toBe("125.00");
  });

  it("full refund nets revenue to zero (plus kept shipping costs and fees)", () => {
    const o = order({
      sales: [
        ...order().sales,
        productSale("R1", "L1", -2, "-180.00", { agreementType: "RefundAgreement", actionType: "RETURN", happenedLocalDate: "2026-03-12" }),
        productSale("R2", "L2", -1, "-25.00", { agreementType: "RefundAgreement", actionType: "RETURN", happenedLocalDate: "2026-03-12" }),
        sale({ gid: "R3", lineType: "SHIPPING", agreementType: "RefundAgreement", actionType: "RETURN", happenedLocalDate: "2026-03-12", totalAmount: "-10.00" }),
      ],
      refunds: [{ gid: "RF1", localDate: "2026-03-12", lines: [{ lineItemGid: "L1", quantity: 2, restockType: "RETURN", restocked: true }, { lineItemGid: "L2", quantity: 1, restockType: "RETURN", restocked: true }] }],
    });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.revenue)).toBe("0.00");
    expect(m(r.totals.cogs)).toBe("0.00");
    expect(m(r.contributionBeforeAds)).toBe("-12.97"); // shipping 8.50 + fees 4.47 are not recovered
    expect(r.margin).toBeNull(); // zero revenue → no ratio
  });

  it("fees can be returned pro rata on refund when the policy says so", () => {
    const r = computeOrderProfit(refunded("RETURN"), ctx(), policy({ feesRefundedOnRefund: true }));
    expect(m(day(r, "2026-04-02").transactionFees)).toBe("-1.87"); // 4.47 × 90 / 215
  });
});

describe("COGS with effective-dated costs", () => {
  const versions = { V1: [{ id: "old", from: "2026-01-01", to: "2026-03-10", landed: "28.00", source: "manual" }, { id: "new", from: "2026-03-10", to: null, landed: "31.20", source: "manual" }] };

  it("uses the version effective on the order date, not today's cost", () => {
    const before = computeOrderProfit(order({ localDate: "2026-03-09", sales: [productSale("S1", "L1", 2, "200.00", { happenedLocalDate: "2026-03-09" })] }), ctx({ unitCosts: versions }), policy());
    const on = computeOrderProfit(order({ sales: [productSale("S1", "L1", 2, "200.00")] }), ctx({ unitCosts: versions }), policy());
    expect(m(before.totals.cogs)).toBe("56.00");
    expect(before.cogsLines[0]!.costVersionId).toBe("old");
    expect(m(on.totals.cogs)).toBe("62.40");
  });

  it("reverses a later return at the cost originally used", () => {
    const o = order({
      localDate: "2026-03-09",
      sales: [
        productSale("S1", "L1", 2, "200.00", { happenedLocalDate: "2026-03-09" }),
        productSale("R1", "L1", -1, "-100.00", { agreementType: "RefundAgreement", actionType: "RETURN", happenedLocalDate: "2026-05-01" }),
      ],
      refunds: [{ gid: "RF1", localDate: "2026-05-01", lines: [{ lineItemGid: "L1", quantity: 1, restockType: "RETURN", restocked: true }] }],
    });
    const r = computeOrderProfit(o, ctx({ unitCosts: versions }), policy());
    expect(m(day(r, "2026-05-01").cogs)).toBe("-28.00");
  });

  it("missing cost: contributes 0, flags the order incomplete and records revenue without COGS", () => {
    const r = computeOrderProfit(order(), ctx({ unitCosts: { V1: ctx().unitCosts.V1! } }), policy());
    expect(m(r.totals.cogs)).toBe("62.40");
    expect(r.components.cogs.status).toBe("missing");
    expect(r.totals.ordersMissingCogs).toBe(1);
    expect(m(r.totals.revenueMissingCogs)).toBe("25.00");
    expect(r.completeness.complete).toBe(false);
    expect(r.completeness.missing).toContain("cogs");
  });

  it("returns of items without a cost reduce revenue-without-COGS on the return date", () => {
    const o = order({
      sales: [...order().sales, productSale("R1", "L2", -1, "-25.00", { agreementType: "RefundAgreement", actionType: "RETURN", happenedLocalDate: "2026-03-20" })],
      refunds: [{ gid: "RF1", localDate: "2026-03-20", lines: [{ lineItemGid: "L2", quantity: 1, restockType: "NO_RESTOCK", restocked: false }] }],
    });
    const r = computeOrderProfit(o, ctx({ unitCosts: { V1: ctx().unitCosts.V1! } }), policy());
    expect(m(day(r, "2026-03-20").revenueMissingCogs)).toBe("-25.00");
    expect(m(r.totals.revenueMissingCogs)).toBe("0.00");
  });

  it("optional fallback estimates missing costs as a percentage of price, labelled estimated", () => {
    const r = computeOrderProfit(order(), ctx({ unitCosts: {} }), policy({ cogsFallback: { mode: "percent_of_price", percent: "35" } }));
    expect(m(r.totals.cogs)).toBe("78.75"); // 35 % of 225 gross
    expect(r.completeness.estimated).toEqual(["cogs"]);
    expect(r.completeness.complete).toBe(true);
  });

  it("a manual COGS override replaces the calculated cost", () => {
    const r = computeOrderProfit(order(), ctx({ unitCosts: {}, overrides: [{ id: "ov1", component: "cogs", amount: "70.00" }] }), policy());
    expect(m(r.totals.cogs)).toBe("70.00");
    expect(r.components.cogs.status).toBe("manual");
    expect(r.totals.ordersMissingCogs).toBe(0);
    expect(m(r.totals.revenueMissingCogs)).toBe("0.00");
  });
});

describe("order edits (UPDATE sales)", () => {
  it("adding items books sales and COGS on the edit date at the order-date cost; removing reverses them", () => {
    const o = order({
      sales: [
        ...order().sales,
        productSale("U1", "L2", 2, "50.00", { agreementType: "OrderEditAgreement", actionType: "UPDATE", happenedLocalDate: "2026-03-11" }),
        productSale("U2", "L1", -1, "-90.00", { agreementType: "OrderEditAgreement", actionType: "UPDATE", happenedLocalDate: "2026-03-11", discountBeforeTaxes: "-10.00" }),
      ],
    });
    const r = computeOrderProfit(o, ctx(), policy());
    const edit = day(r, "2026-03-11");
    expect(m(edit.grossSales)).toBe("50.00");
    expect(m(edit.returns)).toBe("90.00");
    expect(m(edit.cogs)).toBe("-22.20"); // +2 × 4.50 − 31.20
    expect(edit.unitsSold).toBe(1);
  });
});

describe("transactions and fees", () => {
  const tx = (gid: string, p: Partial<OrderInput["transactions"][number]>) => ({ gid, parentGid: null, kind: "SALE", status: "SUCCESS", gateway: "paypal", manual: false, amount: "100.00", localDate: "2026-03-10", feeAmount: null, feeTaxAmount: null, ...p });
  const gatewayRules = [{ id: "g1", gateway: "paypal", percentRate: "2.6", fixedFee: "0.30", currency: "AUD", thirdPartyFeeApplies: true, effectiveFrom: "2026-01-01", effectiveTo: null }];

  it("split payment: card (actual fee), gift card (no fee), manual (no fee), PayPal (rule + Shopify third-party fee)", () => {
    const o = order({
      transactions: [
        tx("T1", { gateway: "shopify_payments", amount: "50.00", feeAmount: "1.18", feeTaxAmount: "0" }),
        tx("T2", { gateway: "gift_card", amount: "25.00" }),
        tx("T3", { gateway: "Bank Deposit", manual: true, amount: "40.00" }),
        tx("T4", { amount: "100.00" }),
      ],
    });
    const r = computeOrderProfit(o, ctx({ gatewayRules }), policy());
    // PayPal: round_half_up(100 × 2.6 %) + 0.30 + 2 % third-party = 2.60 + 0.30 + 2.00
    expect(m(r.totals.transactionFees)).toBe("6.08");
    expect(m(r.totals.feesEstimatedAmount)).toBe("4.90");
    expect(r.components.fees.status).toBe("rule");
    expect(r.completeness.estimated).toContain("transaction_fees");
  });

  it("authorization + capture: only the capture carries a fee; failed and voided transactions are ignored", () => {
    const o = order({ transactions: [tx("A", { kind: "AUTHORIZATION" }), tx("C", { kind: "CAPTURE", parentGid: "A" }), tx("F", { status: "FAILURE" }), tx("V", { kind: "VOID" })] });
    expect(m(computeOrderProfit(o, ctx({ gatewayRules }), policy()).totals.transactionFees)).toBe("4.90");
  });

  it("no fee data and no rule → fee missing, counted per transaction", () => {
    const r = computeOrderProfit(order({ transactions: [tx("T1", { gateway: "stripe" })] }), ctx(), policy());
    expect(m(r.totals.transactionFees)).toBe("2.00"); // only the known Shopify third-party fee
    expect(r.totals.transactionsMissingFees).toBe(1);
    expect(r.completeness.missing).toContain("transaction_fees");
  });

  it("rule percentages round half-up to minor units per transaction", () => {
    const o = order({ transactions: [tx("T1", { amount: "10.25" })] });
    const rules = [{ ...gatewayRules[0]!, percentRate: "2", fixedFee: "0", thirdPartyFeeApplies: false }];
    expect(m(computeOrderProfit(o, ctx({ gatewayRules: rules }), policy()).totals.transactionFees)).toBe("0.21"); // 0.205 → 0.21
  });
});

describe("chargebacks (§5.5)", () => {
  const dispute = (status: string, p: Partial<OrderInput["disputes"][number]> = {}) => ({ gid: "D1", type: "CHARGEBACK", status, amount: "215.00", fee: "25.00", finalizedOn: "2026-04-20", ...p });

  it("lost: amount + fee booked on the resolution date; revenue unchanged", () => {
    const r = computeOrderProfit(order({ disputes: [dispute("LOST")] }), ctx(), policy());
    const d = day(r, "2026-04-20");
    expect(m(d.chargebackLoss)).toBe("215.00");
    expect(m(d.chargebackFees)).toBe("25.00");
    expect(m(r.totals.revenue)).toBe("215.00");
    expect(m(r.contributionBeforeAds)).toBe("-104.87");
  });

  it("won, under review and inquiries cost nothing; accepted counts like lost", () => {
    for (const st of ["WON", "UNDER_REVIEW", "NEEDS_RESPONSE"]) expect(m(computeOrderProfit(order({ disputes: [dispute(st)] }), ctx(), policy()).components.chargebacks.amount)).toBe("0.00");
    expect(m(computeOrderProfit(order({ disputes: [dispute("LOST", { type: "INQUIRY" })] }), ctx(), policy()).components.chargebacks.amount)).toBe("0.00");
    expect(m(computeOrderProfit(order({ disputes: [dispute("ACCEPTED")] }), ctx(), policy()).components.chargebacks.amount)).toBe("240.00");
  });

  it("does not double count money already refunded; default fee policy; missing fee flagged", () => {
    const refundedHalf = [...order().transactions, { gid: "T2", parentGid: "T1", kind: "REFUND", status: "SUCCESS", gateway: "shopify_payments", manual: false, amount: "100.00", localDate: "2026-03-12", feeAmount: null, feeTaxAmount: null }];
    const r = computeOrderProfit(order({ transactions: refundedHalf, disputes: [dispute("LOST", { fee: null })] }), ctx(), policy({ defaultChargebackFee: "15.00" }));
    expect(m(r.totals.chargebackLoss)).toBe("115.00");
    expect(m(r.totals.chargebackFees)).toBe("15.00");
    expect(r.components.chargebacks.status).toBe("rule");
    const noFee = computeOrderProfit(order({ disputes: [dispute("LOST", { fee: null })] }), ctx(), policy());
    expect(noFee.completeness.missing).toContain("chargeback_fee");
  });

  it("chargebackDating = order books it on the order date", () => {
    const r = computeOrderProfit(order({ disputes: [dispute("LOST")] }), ctx(), policy({ chargebackDating: "order" }));
    expect(m(day(r, "2026-03-10").chargebackLoss)).toBe("215.00");
  });
});

describe("shipping rules (§5.2)", () => {
  const rule = (id: string, params: OrderCostContext["shippingRules"][number]["params"], extra: Partial<OrderCostContext["shippingRules"][number]> = {}) => ({
    id, name: id, type: params.type, countryCodes: null, priority: 100, params, currency: "AUD", effectiveFrom: "2026-01-01", effectiveTo: null, ...extra,
  });
  const cost = (rules: OrderCostContext["shippingRules"], o: Partial<OrderInput> = {}) => m(computeOrderProfit(order(o), ctx({ shippingRules: rules }), policy()).totals.shippingCost);

  it("per item, first + additional, tiered by quantity (3 shippable units)", () => {
    expect(cost([rule("a", { type: "per_item", amount: "3.00" })])).toBe("9.00");
    expect(cost([rule("b", { type: "first_plus_additional", first: "8.00", additional: "2.50" })])).toBe("13.00");
    expect(cost([rule("c", { type: "tiered_quantity", tiers: [{ minQuantity: 1, amount: "8" }, { minQuantity: 3, amount: "12" }, { minQuantity: 6, amount: "15" }] })])).toBe("12.00");
  });

  it("tiered by weight: total shipment weight picks the tier; unknown weight is missing, never guessed", () => {
    const byWeight = rule("w", { type: "tiered_weight", tiers: [{ minGrams: 0, amount: "9" }, { minGrams: 1000, amount: "14" }, { minGrams: 5000, amount: "25" }] });
    const lines = (w1: number | null, w2: number | null) => [
      { gid: "L1", variantId: "V1", title: "Sneaker", quantity: 2, isGiftCard: false, requiresShipping: true, weightGrams: w1 },
      { gid: "L2", variantId: "V2", title: "Socks", quantity: 1, isGiftCard: false, requiresShipping: true, weightGrams: w2 },
    ];
    expect(cost([byWeight], { lines: lines(450, 80) })).toBe("9.00"); // 980 g
    expect(cost([byWeight], { lines: lines(450, 100) })).toBe("14.00"); // exactly 1,000 g
    expect(cost([byWeight], { lines: lines(2600, 100) })).toBe("25.00"); // 5,300 g
    const r = computeOrderProfit(order({ lines: lines(450, null) }), ctx({ shippingRules: [byWeight] }), policy());
    expect(m(r.totals.shippingCost)).toBe("0.00");
    expect(r.totals.ordersMissingShipping).toBe(1);
    // 0 g is how Shopify stores "no weight entered": unknown, not weightless.
    expect(computeOrderProfit(order({ lines: lines(450, 0) }), ctx({ shippingRules: [byWeight] }), policy()).totals.ordersMissingShipping).toBe(1);
    expect(r.completeness.missing).toContain("shipping");
    expect(r.components.shipping.source).toContain("needs item weights");
  });

  it("country scope and priority pick the rule; effective dates are [from, to)", () => {
    const rules = [rule("world", { type: "per_order", amount: "20" }, { priority: 200 }), rule("au", { type: "per_order", amount: "8" }, { countryCodes: ["AU"] })];
    expect(cost(rules)).toBe("8.00");
    expect(cost(rules, { shippingCountryCode: "NZ" })).toBe("20.00");
    expect(cost([rule("x", { type: "per_order", amount: "5" }, { effectiveTo: "2026-03-10" })])).toBe("0.00");
  });

  it("no rule → missing; no shippable items → 0; cancelled before fulfilment → 0", () => {
    const r = computeOrderProfit(order(), ctx({ shippingRules: [] }), policy());
    expect(r.totals.ordersMissingShipping).toBe(1);
    expect(r.completeness.missing).toContain("shipping");
    expect(cost([rule("a", { type: "per_order", amount: "8" })], { cancelled: true, fulfilled: false })).toBe("0.00");
    expect(cost([rule("a", { type: "per_order", amount: "8" })], { cancelled: true, fulfilled: true })).toBe("8.00"); // partial/complete fulfilment keeps the cost
  });
});

describe("gift cards", () => {
  it("gift card sales are deferred (memo), with zero COGS and no shipping", () => {
    const o = order({
      lines: [{ gid: "G1", variantId: "VG", title: "Gift card", quantity: 1, isGiftCard: true, requiresShipping: false }],
      sales: [sale({ gid: "S1", lineType: "GIFT_CARD", lineItemGid: "G1", quantity: 1, totalAmount: "50.00" })],
      transactions: [{ gid: "T1", parentGid: null, kind: "SALE", status: "SUCCESS", gateway: "shopify_payments", manual: false, amount: "50.00", localDate: "2026-03-10", feeAmount: "0.88", feeTaxAmount: "0" }],
    });
    const r = computeOrderProfit(o, ctx({ unitCosts: {} }), policy());
    expect(m(r.totals.giftCardSales)).toBe("50.00");
    expect(m(r.totals.revenue)).toBe("0.00");
    expect(m(r.totals.cogs)).toBe("0.00");
    expect(r.components.shipping.source).toBe("no shippable items");
    expect(r.completeness.complete).toBe(true);
  });

  it("redemption: products bought with a gift card are normal revenue; the gift card payment has no fee", () => {
    const o = order({ transactions: [{ gid: "T1", parentGid: null, kind: "SALE", status: "SUCCESS", gateway: "gift_card", manual: false, amount: "215.00", localDate: "2026-03-10", feeAmount: null, feeTaxAmount: null }] });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.revenue)).toBe("215.00");
    expect(m(r.totals.transactionFees)).toBe("0.00");
    expect(r.completeness.complete).toBe(true);
  });
});

describe("policy and inclusion", () => {
  it("excludes test orders and statuses outside the policy", () => {
    expect(computeOrderProfit(order({ test: true }), ctx(), policy()).included).toBe(false);
    const voided = computeOrderProfit(order({ financialStatus: "VOIDED" }), ctx(), policy());
    expect(voided.included).toBe(false);
    expect(voided.days).toEqual([]);
  });

  it("tips and duties follow the policy; unclassified sales are revenue but flagged", () => {
    const o = order({
      sales: [...order().sales, sale({ gid: "T", lineType: "TIP", totalAmount: "5.00" }), sale({ gid: "D", lineType: "DUTY", totalAmount: "7.00" }), sale({ gid: "A", lineType: "ADJUSTMENT", totalAmount: "-1.00" })],
    });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.revenue)).toBe("219.00"); // + tip − adjustment, duties pass-through
    expect(m(r.totals.dutiesAndFees)).toBe("7.00");
    expect(m(r.totals.unclassifiedSalesAmount)).toBe("1.00");
    expect(r.completeness.missing).toContain("unclassified_sales");
    expect(m(computeOrderProfit(o, ctx(), policy({ tipsAsRevenue: false, dutiesAndFeesAsRevenue: true })).totals.revenue)).toBe("221.00");
  });

  it("a zero-amount adjustment pair (as Shopify emits on refunds) is not flagged", () => {
    const o = order({ sales: [...order().sales, sale({ gid: "A1", lineType: "ADJUSTMENT", actionType: "RETURN", totalAmount: "35.99" }), sale({ gid: "A2", lineType: "ADJUSTMENT", actionType: "RETURN", totalAmount: "-35.99" })] });
    const r = computeOrderProfit(o, ctx(), policy());
    expect(m(r.totals.adjustments)).toBe("0.00");
    expect(r.completeness.missing).not.toContain("unclassified_sales");
  });
});

describe("expense allocation (§5.7)", () => {
  const base = (localDate: string, p: Partial<ExpenseBase> = {}): ExpenseBase => ({ localDate, revenue: dec("1000"), netSales: dec("900"), adSpend: dec("200"), ordersCount: 10, ...p });
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => base(new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)));
  const exp = (p: Partial<ExpenseInput>): ExpenseInput => ({ id: "e", name: "e", type: "recurring", frequency: "monthly", allocation: "spread", amount: "310.00", percent: null, currency: "AUD", startDate: "2026-01-01", endDate: null, isAdSpend: false, isMarketing: false, ...p });
  const fx = fxLookupFrom({ USD: { "2026-01-30": "1.5" } }, "AUD");
  const total = (r: Map<string, ExpenseDay>, k: Exclude<keyof ExpenseDay, "fxIssues">) => [...r.values()].reduce((t, d) => t.plus(d[k]), dec("0"));

  it("monthly spread uses each month's real length across the month boundary", () => {
    const r = allocateExpenses([exp({})], days("2026-01-30", 4), fx); // Jan 30, 31, Feb 1, 2
    expect(toMoneyString(r.get("2026-01-31")!.fixedExpenses, 2)).toBe("10.00"); // 310 / 31
    expect(toMoneyString(r.get("2026-02-01")!.fixedExpenses, 2)).toBe("11.07"); // 310 / 28
    const jan = allocateExpenses([exp({})], days("2026-01-01", 31), fx);
    expect(toMoneyString(total(jan, "fixedExpenses"), 2)).toBe("310.00"); // unrounded parts sum exactly
  });

  it("days with a DST change still get one day's share (days are calendar dates)", () => {
    const r = allocateExpenses([exp({ startDate: "2026-04-01", amount: "300" })], days("2026-04-04", 2), fx); // Sydney DST ends Apr 5
    expect(toMoneyString(r.get("2026-04-05")!.fixedExpenses, 2)).toBe("10.00");
  });

  it("on-date, weekly, daily, one-time and end dates", () => {
    const d = days("2026-01-01", 14);
    expect(toMoneyString(total(allocateExpenses([exp({ allocation: "on_date" })], d, fx), "fixedExpenses"), 2)).toBe("310.00");
    expect(toMoneyString(allocateExpenses([exp({ allocation: "on_date" })], d, fx).get("2026-01-02")!.fixedExpenses, 2)).toBe("0.00");
    expect(toMoneyString(total(allocateExpenses([exp({ frequency: "weekly", amount: "70" })], d, fx), "fixedExpenses"), 2)).toBe("140.00");
    expect(toMoneyString(total(allocateExpenses([exp({ frequency: "daily", amount: "5", endDate: "2026-01-03" })], d, fx), "fixedExpenses"), 2)).toBe("15.00");
    expect(toMoneyString(total(allocateExpenses([exp({ type: "one_time", frequency: null, amount: "99", startDate: "2026-01-05" })], d, fx), "fixedExpenses"), 2)).toBe("99.00");
  });

  it("per-order and percentage expenses, ad-spend flag and marketing memo", () => {
    const d = [base("2026-01-01")];
    const r = allocateExpenses(
      [
        exp({ id: "a", type: "per_order", frequency: null, amount: "1.50" }),
        exp({ id: "b", type: "percent_of_revenue", frequency: null, amount: null, percent: "2" }),
        exp({ id: "c", type: "percent_of_net_sales", frequency: null, amount: null, percent: "1" }),
        exp({ id: "d", type: "percent_of_ad_spend", frequency: null, amount: null, percent: "10", isMarketing: true }),
        exp({ id: "e", type: "one_time", frequency: null, amount: "50", isAdSpend: true }),
        exp({ id: "f", type: "one_time", frequency: null, amount: "40", isMarketing: true }),
      ],
      d,
      fx,
    ).get("2026-01-01")!;
    expect(toMoneyString(r.variableExpenses, 2)).toBe("44.00"); // 15 + 20 + 9
    expect(toMoneyString(r.adLinkedExpenses, 2)).toBe("20.00");
    expect(toMoneyString(r.adSpend, 2)).toBe("50.00");
    expect(toMoneyString(r.fixedExpenses, 2)).toBe("40.00");
    expect(toMoneyString(r.marketingExpenses, 2)).toBe("60.00");
  });

  it("foreign-currency expenses convert at the day's rate (or the last rate within 7 days); no rate → excluded and flagged", () => {
    const usd = exp({ type: "one_time", frequency: null, amount: "10", currency: "USD", startDate: "2026-02-02" });
    expect(toMoneyString(allocateExpenses([usd], [base("2026-02-02")], fx).get("2026-02-02")!.fixedExpenses, 2)).toBe("15.00");
    const late = allocateExpenses([{ ...usd, startDate: "2026-02-20" }], [base("2026-02-20")], fx).get("2026-02-20")!;
    expect(toMoneyString(late.fixedExpenses, 2)).toBe("0.00");
    expect(late.fxIssues).toBe(1);
  });
});
