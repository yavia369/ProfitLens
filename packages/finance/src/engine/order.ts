import type { LocalDate } from "../dates";
import { Decimal, dec, ratio, toMoneyString, ZERO } from "../money";
import type { FinancialPolicy } from "../policy";
import { costVersionOn, percentCharge, selectGatewayRule, selectHandlingRule, selectShippingRule, shippingRuleAmount } from "./rules";
import {
  ENGINE_VERSION,
  ORDER_COUNT_PARTS,
  ORDER_MONEY_PARTS,
  worstStatus,
  type CogsLine,
  type ComponentResult,
  type CostStatus,
  type DayParts,
  type EngineSale,
  type OrderCostContext,
  type OrderInput,
  type OrderProfitResult,
} from "./types";

export function emptyDayParts(): DayParts {
  const parts = {} as Record<string, Decimal | number>;
  for (const k of ORDER_MONEY_PARTS) parts[k] = ZERO;
  for (const k of ORDER_COUNT_PARTS) parts[k] = 0;
  return parts as DayParts;
}

export function addDayParts(a: DayParts, b: DayParts): DayParts {
  const out = emptyDayParts();
  for (const k of ORDER_MONEY_PARTS) out[k] = a[k].plus(b[k]);
  for (const k of ORDER_COUNT_PARTS) out[k] = a[k] + b[k];
  return out;
}

const s = (d: Decimal) => toMoneyString(d);
const MONEY_IN = new Set(["SALE", "CAPTURE"]);
const CHARGEBACK_LOST = new Set(["LOST", "ACCEPTED"]);
const RETURN_AGREEMENTS = new Set(["RefundAgreement", "ReturnAgreement"]);

/** Per-sale revenue decomposition (FINANCIAL_MODEL §3). */
function saleAmounts(sale: EngineSale) {
  const tax = dec(sale.taxAmount);
  const net = dec(sale.totalAmount).minus(tax);
  const discount = dec(sale.discountBeforeTaxes);
  return { net, discount, gross: net.plus(discount), tax };
}

/** A product sale that adds units (order placed, or an edit that added items). */
function addsUnits(sale: EngineSale): boolean {
  if (sale.actionType === "ORDER") return true;
  if (sale.actionType !== "UPDATE") return false;
  return sale.quantity !== null ? sale.quantity > 0 : dec(sale.totalAmount).gt(0);
}

/**
 * Lifetime profit of one order, split by store-local day (FINANCIAL_MODEL §4–5, §8).
 * Pure: everything it depends on is in `order`, `ctx` and `policy`.
 */
export function computeOrderProfit(order: OrderInput, ctx: OrderCostContext, policy: FinancialPolicy): OrderProfitResult {
  const exclusion = order.test
    ? "test order"
    : order.financialStatus && !policy.includedFinancialStatuses.includes(order.financialStatus.toUpperCase())
      ? `financial status ${order.financialStatus} is excluded by policy`
      : null;
  if (exclusion) return excluded(order, exclusion);

  const days = new Map<LocalDate, DayParts>();
  const day = (d: LocalDate): DayParts => {
    let p = days.get(d);
    if (!p) days.set(d, (p = emptyDayParts()));
    return p;
  };
  const bump = (d: LocalDate, k: (typeof ORDER_MONEY_PARTS)[number], v: Decimal) => {
    const p = day(d);
    p[k] = p[k].plus(v);
  };
  const count = (d: LocalDate, k: (typeof ORDER_COUNT_PARTS)[number], v: number) => {
    const p = day(d);
    p[k] += v;
  };
  const refundDate = (d: LocalDate) => (policy.refundDating === "order" ? order.localDate : d);
  const saleDate = (sale: EngineSale) => (RETURN_AGREEMENTS.has(sale.agreementType) ? refundDate(sale.happenedLocalDate) : sale.happenedLocalDate);

  const missing = new Set<string>();
  const estimated = new Set<string>();
  const linesByGid = new Map(order.lines.map((l) => [l.gid, l]));
  // Callers pass overrides oldest first, so the latest one per component wins.
  const overrides = new Map(ctx.overrides.map((o) => [o.component, o]));

  // ---- revenue (event-dated ledger)
  count(order.localDate, "ordersCount", 1);
  for (const sale of order.sales) {
    const d = saleDate(sale);
    const { net, discount, gross, tax } = saleAmounts(sale);
    bump(d, "taxes", tax);
    switch (sale.lineType) {
      case "PRODUCT":
        if (addsUnits(sale)) {
          bump(d, "grossSales", gross);
          bump(d, "discounts", discount);
          count(d, "unitsSold", Math.abs(sale.quantity ?? 0));
        } else {
          bump(d, "returns", net.neg());
          count(d, "unitsSold", -Math.abs(sale.quantity ?? 0));
        }
        break;
      case "SHIPPING":
        bump(d, "shippingCharged", net);
        break;
      case "TIP":
        bump(d, "tips", net);
        break;
      case "GIFT_CARD":
        bump(d, "giftCardSales", net);
        break;
      case "DUTY":
      case "FEE":
      case "ADDITIONAL_FEE":
        bump(d, "dutiesAndFees", net);
        break;
      default: // ADJUSTMENT, UNKNOWN (flagged per day below, net: Shopify emits offsetting pairs on refunds)
        bump(d, "adjustments", net);
    }
  }

  // ---- COGS (§5.1)
  const cogsLines: CogsLine[] = [];
  const unitCostByLine = new Map<string, { unit: Decimal | null; status: CostStatus; versionId: string | null }>();
  const soldQty = new Map<string, number>();
  let orderMissingCogs = false;
  for (const sale of order.sales) {
    if (sale.lineType !== "PRODUCT" || !addsUnits(sale) || !sale.lineItemGid) continue;
    const qty = Math.abs(sale.quantity ?? 0);
    const line = linesByGid.get(sale.lineItemGid);
    const d = saleDate(sale);
    soldQty.set(sale.lineItemGid, (soldQty.get(sale.lineItemGid) ?? 0) + qty);
    let unit: Decimal | null;
    let status: CostStatus;
    let versionId: string | null = null;
    if (line?.isGiftCard) {
      unit = ZERO;
      status = "actual";
    } else {
      const version = line?.variantId ? costVersionOn(ctx.unitCosts[line.variantId], order.localDate) : null;
      if (version) {
        unit = dec(version.landed);
        status = version.source === "shopify_sync" ? "actual" : "manual";
        versionId = version.id;
      } else if (policy.cogsFallback.mode === "percent_of_price" && qty > 0) {
        unit = saleAmounts(sale).gross.div(qty).times(dec(policy.cogsFallback.percent)).div(100);
        status = "estimated";
      } else {
        unit = null;
        status = "missing";
        orderMissingCogs = true;
        bump(d, "revenueMissingCogs", saleAmounts(sale).net);
      }
    }
    unitCostByLine.set(sale.lineItemGid, { unit, status, versionId });
    cogsLines.push({ localDate: d, lineItemGid: sale.lineItemGid, variantId: line?.variantId ?? null, kind: "sale", quantity: qty, unitCost: unit, amount: unit ? unit.times(qty) : ZERO, status, costVersionId: versionId });
  }
  // Reversals: refund lines whose goods came back / never shipped, then edits that removed units.
  const reversedQty = new Map<string, number>();
  const refundedLineQty = new Map<string, number>();
  const reverse = (lineItemGid: string, qty: number, d: LocalDate) => {
    const sold = soldQty.get(lineItemGid) ?? 0;
    const already = reversedQty.get(lineItemGid) ?? 0;
    const q = Math.min(qty, sold - already);
    if (q <= 0) return;
    reversedQty.set(lineItemGid, already + q);
    const cost = unitCostByLine.get(lineItemGid);
    const line = linesByGid.get(lineItemGid);
    cogsLines.push({
      localDate: d,
      lineItemGid,
      variantId: line?.variantId ?? null,
      kind: "reversal",
      quantity: -q,
      unitCost: cost?.unit ?? null,
      amount: cost?.unit ? cost.unit.times(q).neg() : ZERO,
      status: cost?.status ?? "missing",
      costVersionId: cost?.versionId ?? null,
    });
  };
  for (const refund of order.refunds) {
    for (const rl of refund.lines) {
      refundedLineQty.set(rl.lineItemGid, (refundedLineQty.get(rl.lineItemGid) ?? 0) + rl.quantity);
      const eligible = rl.restockType === "LEGACY_RESTOCK" ? rl.restocked : policy.cogsReversalRestockTypes.includes(rl.restockType);
      if (eligible) reverse(rl.lineItemGid, rl.quantity, refundDate(refund.localDate));
    }
  }
  for (const sale of order.sales) {
    if (sale.lineType !== "PRODUCT" || sale.actionType !== "UPDATE" || addsUnits(sale) || !sale.lineItemGid) continue;
    // Units removed by an order edit were never shipped. Any refund line for the item already decided its cost.
    const removed = Math.abs(sale.quantity ?? 0) - (refundedLineQty.get(sale.lineItemGid) ?? 0);
    if (removed > 0) reverse(sale.lineItemGid, removed, sale.happenedLocalDate);
  }
  // Returned/removed units of lines without a cost also leave "revenue without COGS" (keeps the share ≤ 100 %).
  for (const sale of order.sales) {
    if (sale.lineType !== "PRODUCT" || addsUnits(sale) || !sale.lineItemGid) continue;
    if (unitCostByLine.get(sale.lineItemGid)?.status === "missing") bump(saleDate(sale), "revenueMissingCogs", saleAmounts(sale).net);
  }
  let cogs: ComponentResult;
  const cogsOverride = overrides.get("cogs");
  if (cogsOverride) {
    const amount = dec(cogsOverride.amount);
    cogs = { amount, status: "manual", source: `override ${cogsOverride.id}` };
    orderMissingCogs = false;
    for (const [d, p] of days) if (!p.revenueMissingCogs.isZero()) day(d).revenueMissingCogs = ZERO;
    bump(order.localDate, "cogs", amount);
    cogsLines.splice(0, cogsLines.length, { localDate: order.localDate, lineItemGid: null, variantId: null, kind: "override", quantity: 0, unitCost: null, amount, status: "manual", costVersionId: null });
  } else {
    for (const l of cogsLines) bump(l.localDate, "cogs", l.amount);
    const status = worstStatus(cogsLines.filter((l) => l.kind === "sale").map((l) => l.status));
    cogs = { amount: cogsLines.reduce((t, l) => t.plus(l.amount), ZERO), status, source: "variant landed cost on the order date" };
  }
  if (orderMissingCogs) {
    count(order.localDate, "ordersMissingCogs", 1);
    missing.add("cogs");
  }
  if (cogs.status === "estimated") estimated.add("cogs");

  // ---- shipping cost (§5.2) and handling (§5.3)
  const shippableUnits = order.lines.filter((l) => l.requiresShipping && !l.isGiftCard).reduce((n, l) => n + l.quantity, 0);
  const physicalUnits = order.lines.filter((l) => !l.isGiftCard).reduce((n, l) => n + l.quantity, 0);
  let shipping: ComponentResult;
  const shippingOverride = overrides.get("shipping");
  if (shippingOverride) shipping = { amount: dec(shippingOverride.amount), status: "manual", source: `override ${shippingOverride.id}` };
  else if (shippableUnits === 0) shipping = { amount: ZERO, status: "actual", source: "no shippable items" };
  else if (order.cancelled && !order.fulfilled && policy.zeroShippingIfUnfulfilledCancel)
    shipping = { amount: ZERO, status: "actual", source: "cancelled before fulfilment" };
  else {
    const rule = selectShippingRule(ctx.shippingRules, order.localDate, order.shippingCountryCode, ctx.storeCurrency);
    const shippable = order.lines.filter((l) => l.requiresShipping && !l.isGiftCard);
    // Shipment weight is known only when every shippable line has a weight. Shopify stores 0 g when no weight
    // was entered, so 0 g on a shippable item counts as unknown rather than weightless (D-048).
    const weightGrams = shippable.every((l) => typeof l.weightGrams === "number" && l.weightGrams > 0) ? shippable.reduce((g, l) => g + l.weightGrams! * l.quantity, 0) : null;
    const amount = rule ? shippingRuleAmount(rule.params, shippableUnits, weightGrams) : null;
    if (rule && amount) shipping = { amount, status: "rule", source: `rule ${rule.id} (${rule.name})${rule.params.type === "tiered_weight" ? `, ${weightGrams} g` : ""}` };
    else if (rule) {
      shipping = { amount: ZERO, status: "missing", source: `rule ${rule.id} (${rule.name}) needs item weights; some items have none` };
      count(order.localDate, "ordersMissingShipping", 1);
      missing.add("shipping");
    } else {
      shipping = { amount: ZERO, status: "missing", source: "no shipping rule matches" };
      count(order.localDate, "ordersMissingShipping", 1);
      missing.add("shipping");
    }
  }
  bump(order.localDate, "shippingCost", shipping.amount);

  let handling: ComponentResult;
  const handlingOverride = overrides.get("handling");
  if (handlingOverride) handling = { amount: dec(handlingOverride.amount), status: "manual", source: `override ${handlingOverride.id}` };
  else {
    const rule = selectHandlingRule(ctx.handlingRules, order.localDate, ctx.storeCurrency);
    if (!rule || physicalUnits === 0) handling = { amount: ZERO, status: null, source: rule ? "no physical items" : "no handling rule" };
    else handling = { amount: rule.mode === "per_order" ? dec(rule.amount) : dec(rule.amount).times(physicalUnits), status: "rule", source: `rule ${rule.id}` };
  }
  bump(order.localDate, "handlingCost", handling.amount);

  // ---- transaction fees (§5.4)
  const feeTrace: Record<string, unknown>[] = [];
  const feeByTx = new Map<string, Decimal>();
  const feeStatuses: CostStatus[] = [];
  const feesOverride = overrides.get("transaction_fees");
  for (const tx of order.transactions) {
    if (!MONEY_IN.has(tx.kind) || tx.status !== "SUCCESS") continue;
    const d = tx.localDate ?? order.localDate;
    const amount = dec(tx.amount);
    const gateway = (tx.gateway ?? "").toLowerCase();
    let fee: Decimal;
    let status: CostStatus;
    let source: string;
    if (tx.feeAmount !== null && tx.feeSource) {
      // The processor's own fee; Shopify's third-party fee for non-Shopify-Payments gateways is billed on top.
      const thirdParty = gateway !== "shopify_payments" && ctx.thirdPartyFeeRate !== null ? percentCharge(amount, dec(ctx.thirdPartyFeeRate), ctx.storeCurrency) : ZERO;
      fee = dec(tx.feeAmount).plus(thirdParty);
      status = "actual";
      source = `${tx.feeSource}${thirdParty.isZero() ? "" : " + Shopify third-party fee"}`;
    } else if (tx.feeAmount !== null) {
      fee = dec(tx.feeAmount).plus(policy.feeTaxRecoverable || tx.feeTaxAmount === null ? ZERO : dec(tx.feeTaxAmount));
      status = "actual";
      source = "Shopify-reported fee";
    } else if (tx.manual || gateway === "gift_card") {
      fee = ZERO;
      status = "actual";
      source = tx.manual ? "manual payment method (no fee)" : "gift card redemption (no fee)";
    } else {
      const thirdParty =
        gateway !== "shopify_payments" && ctx.thirdPartyFeeRate !== null ? percentCharge(amount, dec(ctx.thirdPartyFeeRate), ctx.storeCurrency) : ZERO;
      const rule = selectGatewayRule(ctx.gatewayRules, gateway, d, ctx.storeCurrency);
      if (rule) {
        fee = percentCharge(amount, dec(rule.percentRate), ctx.storeCurrency).plus(dec(rule.fixedFee)).plus(rule.thirdPartyFeeApplies ? thirdParty : ZERO);
        status = "rule";
        source = `gateway rule ${rule.id}${rule.thirdPartyFeeApplies && !thirdParty.isZero() ? " + Shopify third-party fee" : ""}`;
      } else {
        fee = thirdParty;
        status = "missing";
        source = thirdParty.isZero() ? "no fee data and no gateway rule" : "Shopify third-party fee only; processor fee unknown (no gateway rule)";
      }
    }
    if (!feesOverride) {
      bump(d, "transactionFees", fee);
      if (status === "rule") bump(d, "feesEstimatedAmount", fee);
      if (status === "missing") count(d, "transactionsMissingFees", 1);
    }
    feeByTx.set(tx.gid, fee);
    feeStatuses.push(status);
    feeTrace.push({ transaction: tx.gid, kind: tx.kind, gateway: tx.gateway, amount: s(amount), fee: s(fee), status, source, date: d });
  }
  if (policy.feesRefundedOnRefund && !feesOverride) {
    const parents = new Map(order.transactions.map((t) => [t.gid, t]));
    for (const tx of order.transactions) {
      if (tx.kind !== "REFUND" || tx.status !== "SUCCESS" || !tx.parentGid) continue;
      const parent = parents.get(tx.parentGid);
      const parentFee = feeByTx.get(tx.parentGid);
      if (!parent || parentFee === undefined || dec(parent.amount).isZero()) continue;
      const returned = parentFee.times(dec(tx.amount)).div(dec(parent.amount)).neg();
      const d = refundDate(tx.localDate ?? order.localDate);
      bump(d, "transactionFees", returned);
      feeTrace.push({ transaction: tx.gid, kind: tx.kind, fee: s(returned), status: "rule", source: "fee returned pro rata on refund", date: d });
    }
  }
  let fees: ComponentResult;
  if (feesOverride) {
    fees = { amount: dec(feesOverride.amount), status: "manual", source: `override ${feesOverride.id}` };
    bump(order.localDate, "transactionFees", fees.amount);
  } else {
    const status = feeStatuses.length ? worstStatus(feeStatuses) : null;
    fees = { amount: [...days.values()].reduce((t, p) => t.plus(p.transactionFees), ZERO), status, source: "per transaction" };
    if (status === "missing") missing.add("transaction_fees");
    if (status === "rule") estimated.add("transaction_fees");
  }

  // ---- chargebacks (§5.5): lost/accepted chargebacks only; revenue is not reduced
  const moneyIn = order.transactions.filter((t) => MONEY_IN.has(t.kind) && t.status === "SUCCESS").reduce((t, x) => t.plus(dec(x.amount)), ZERO);
  const refunded = order.transactions.filter((t) => t.kind === "REFUND" && t.status === "SUCCESS").reduce((t, x) => t.plus(dec(x.amount)), ZERO);
  let stillHeld = Decimal.max(moneyIn.minus(refunded), ZERO);
  const chargebackTrace: Record<string, unknown>[] = [];
  const chargebackStatuses: CostStatus[] = [];
  let chargebackTotal = ZERO;
  for (const dsp of order.disputes) {
    if (dsp.type !== "CHARGEBACK" || !CHARGEBACK_LOST.has(dsp.status)) continue;
    // De-duplication: a chargeback can only take back money the store still holds (refunds already returned the rest).
    const loss = Decimal.min(dec(dsp.amount), stillHeld);
    stillHeld = stillHeld.minus(loss);
    const feeStr = dsp.fee ?? policy.defaultChargebackFee;
    const fee = feeStr ? dec(feeStr) : ZERO;
    const status: CostStatus = dsp.fee ? "actual" : feeStr ? "rule" : "missing";
    const d = policy.chargebackDating === "order" ? order.localDate : (dsp.finalizedOn ?? order.localDate);
    bump(d, "chargebackLoss", loss);
    bump(d, "chargebackFees", fee);
    chargebackTotal = chargebackTotal.plus(loss).plus(fee);
    chargebackStatuses.push(status);
    if (status === "missing") missing.add("chargeback_fee");
    chargebackTrace.push({ dispute: dsp.gid, status: dsp.status, amount: dsp.amount, loss: s(loss), fee: s(fee), feeStatus: status, date: d });
  }
  const chargebacks: ComponentResult = {
    amount: chargebackTotal,
    status: chargebackStatuses.length ? worstStatus(chargebackStatuses) : null,
    source: chargebackStatuses.length ? "lost/accepted chargebacks" : "none",
  };

  // ---- revenue per day under the policy
  for (const p of days.values()) {
    p.revenue = p.grossSales
      .minus(p.discounts)
      .minus(p.returns)
      .plus(p.shippingCharged)
      .plus(policy.tipsAsRevenue ? p.tips : ZERO)
      .plus(p.adjustments)
      .plus(policy.dutiesAndFeesAsRevenue ? p.dutiesAndFees : ZERO);
    p.unclassifiedSalesAmount = p.adjustments.abs();
  }
  if ([...days.values()].some((p) => !p.unclassifiedSalesAmount.isZero())) missing.add("unclassified_sales");

  const sortedDays = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([localDate, parts]) => ({ localDate, parts }));
  const totals = sortedDays.reduce((t, d) => addDayParts(t, d.parts), emptyDayParts());
  const contributionBeforeAds = totals.revenue
    .minus(totals.cogs)
    .minus(totals.shippingCost)
    .minus(totals.handlingCost)
    .minus(totals.transactionFees)
    .minus(totals.chargebackLoss)
    .minus(totals.chargebackFees);

  return {
    orderId: order.id,
    included: true,
    exclusionReason: null,
    days: sortedDays,
    totals,
    cogsLines,
    components: { cogs, shipping, handling, fees, chargebacks },
    contributionBeforeAds,
    margin: ratio(contributionBeforeAds, totals.revenue),
    completeness: { complete: missing.size === 0, missing: [...missing].sort(), estimated: [...estimated].sort() },
    trace: {
      engineVersion: ENGINE_VERSION,
      order: { id: order.id, name: order.name, localDate: order.localDate, financialStatus: order.financialStatus, cancelled: order.cancelled },
      revenue: { sales: order.sales.length, byDay: sortedDays.map((d) => ({ date: d.localDate, revenue: s(d.parts.revenue), taxes: s(d.parts.taxes) })) },
      cogs: {
        status: cogs.status,
        source: cogs.source,
        lines: cogsLines.map((l) => ({ ...l, unitCost: l.unitCost ? s(l.unitCost) : null, amount: s(l.amount) })),
      },
      shipping: { ...shipping, amount: s(shipping.amount), shippableUnits },
      handling: { ...handling, amount: s(handling.amount) },
      fees: { status: fees.status, source: fees.source, amount: s(fees.amount), transactions: feeTrace },
      chargebacks: { amount: s(chargebacks.amount), disputes: chargebackTrace },
    },
  };
}

function excluded(order: OrderInput, reason: string): OrderProfitResult {
  const none: ComponentResult = { amount: ZERO, status: null, source: "excluded" };
  return {
    orderId: order.id,
    included: false,
    exclusionReason: reason,
    days: [],
    totals: emptyDayParts(),
    cogsLines: [],
    components: { cogs: none, shipping: none, handling: none, fees: none, chargebacks: none },
    contributionBeforeAds: ZERO,
    margin: null,
    completeness: { complete: true, missing: [], estimated: [] },
    trace: { engineVersion: ENGINE_VERSION, order: { id: order.id, name: order.name }, excluded: reason },
  };
}
