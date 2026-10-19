import { dec, localDateOf, toMoneyString, type OrderCostContext, type OrderInput, type ShippingRuleParams, type UnitCostVersion } from "@profitlens/finance";
import { schema, type Database } from "@profitlens/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

export interface StoreCalcContext {
  readonly storeId: string;
  readonly currency: string;
  readonly timezone: string;
  readonly thirdPartyFeeRate: string | null;
  readonly shippingRules: OrderCostContext["shippingRules"];
  readonly handlingRules: OrderCostContext["handlingRules"];
  readonly gatewayRules: OrderCostContext["gatewayRules"];
}

/** Store-wide calculation inputs (rules change rarely; loaded once per recalculation run). */
export async function loadStoreContext(db: Database, storeId: string): Promise<StoreCalcContext> {
  const [st] = await db.select().from(schema.store).where(eq(schema.store.id, storeId));
  if (!st) throw new Error(`store ${storeId} not found`);
  const [ship, handling, gateway] = await Promise.all([
    db.select().from(schema.shippingRule).where(eq(schema.shippingRule.storeId, storeId)).orderBy(asc(schema.shippingRule.effectiveFrom), asc(schema.shippingRule.id)),
    db.select().from(schema.handlingRule).where(eq(schema.handlingRule.storeId, storeId)).orderBy(asc(schema.handlingRule.effectiveFrom), asc(schema.handlingRule.id)),
    db.select().from(schema.gatewayFeeRule).where(eq(schema.gatewayFeeRule.storeId, storeId)).orderBy(asc(schema.gatewayFeeRule.effectiveFrom), asc(schema.gatewayFeeRule.id)),
  ]);
  return {
    storeId,
    currency: st.currency,
    timezone: st.ianaTimezone,
    thirdPartyFeeRate: st.thirdPartyFeeRate,
    shippingRules: ship.map((r) => ({
      id: r.id,
      name: r.name,
      countryCodes: r.countryCodes,
      priority: r.priority,
      params: { ...r.params, type: r.type } as ShippingRuleParams,
      currency: r.currency,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
    handlingRules: handling.map((r) => ({ id: r.id, mode: r.mode as "per_order" | "per_item", amount: r.amount, currency: r.currency, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo })),
    gatewayRules: gateway.map((r) => ({
      id: r.id,
      gateway: r.gateway,
      percentRate: r.percentRate,
      fixedFee: r.fixedFee,
      currency: r.currency,
      thirdPartyFeeApplies: r.thirdPartyFeeApplies,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
  };
}

const FAILED_FULFILLMENT = new Set(["CANCELLED", "ERROR", "FAILURE"]);

/**
 * Loads engine inputs for a batch of orders of one store. Every collection is sorted deterministically so
 * the inputs hash only changes when the data does.
 */
export async function loadOrderInputs(db: Database, store: StoreCalcContext, orderIds: readonly string[]): Promise<{ input: OrderInput; ctx: OrderCostContext }[]> {
  if (orderIds.length === 0) return [];
  const ids = [...orderIds];
  const [orders, lines, sales, refunds, refundLines, txs, disputes, fulfillments, overrides] = await Promise.all([
    db.select().from(schema.order).where(and(eq(schema.order.storeId, store.storeId), inArray(schema.order.id, ids))),
    db.select().from(schema.orderLineItem).where(inArray(schema.orderLineItem.orderId, ids)).orderBy(asc(schema.orderLineItem.shopifyGid)),
    db.select().from(schema.saleLedgerEntry).where(inArray(schema.saleLedgerEntry.orderId, ids)).orderBy(asc(schema.saleLedgerEntry.happenedAt), asc(schema.saleLedgerEntry.saleGid)),
    db.select().from(schema.refund).where(inArray(schema.refund.orderId, ids)).orderBy(asc(schema.refund.createdAtShopify), asc(schema.refund.shopifyGid)),
    db
      .select({ rl: schema.refundLineItem, orderId: schema.refund.orderId })
      .from(schema.refundLineItem)
      .innerJoin(schema.refund, eq(schema.refund.id, schema.refundLineItem.refundId))
      .where(inArray(schema.refund.orderId, ids))
      .orderBy(asc(schema.refundLineItem.shopifyGid)),
    db.select().from(schema.paymentTransaction).where(inArray(schema.paymentTransaction.orderId, ids)).orderBy(asc(schema.paymentTransaction.processedAt), asc(schema.paymentTransaction.shopifyGid)),
    db.select().from(schema.dispute).where(inArray(schema.dispute.orderId, ids)).orderBy(asc(schema.dispute.shopifyGid)),
    db.select({ orderId: schema.fulfillment.orderId, status: schema.fulfillment.status }).from(schema.fulfillment).where(inArray(schema.fulfillment.orderId, ids)),
    db
      .select()
      .from(schema.orderCostOverride)
      .where(and(inArray(schema.orderCostOverride.orderId, ids), isNull(schema.orderCostOverride.supersededAt)))
      .orderBy(asc(schema.orderCostOverride.createdAt), asc(schema.orderCostOverride.id)),
  ]);

  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => v !== null))];
  const versions = variantIds.length
    ? await db
        .select()
        .from(schema.variantCostVersion)
        .where(inArray(schema.variantCostVersion.variantId, variantIds))
        .orderBy(asc(schema.variantCostVersion.effectiveFrom), asc(schema.variantCostVersion.id))
    : [];
  const costsByVariant = new Map<string, UnitCostVersion[]>();
  for (const v of versions) {
    // Versions in another currency would need FX at the order date; cost editing only accepts the store currency.
    if (v.currency !== store.currency) continue;
    const list = costsByVariant.get(v.variantId) ?? [];
    list.push({
      id: v.id,
      from: v.effectiveFrom,
      to: v.effectiveTo,
      landed: toMoneyString(dec(v.productCost).plus(dec(v.inboundShipping)).plus(dec(v.handling))),
      source: v.source,
    });
    costsByVariant.set(v.variantId, list);
  }

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const linesBy = group(lines, (l) => l.orderId);
  const salesBy = group(sales, (s) => s.orderId);
  const refundsBy = group(refunds, (r) => r.orderId);
  const refundLinesBy = group(refundLines, (r) => r.rl.refundId);
  const txBy = group(txs, (t) => t.orderId);
  const disputesBy = group(disputes, (d) => d.orderId);
  const fulfilledOrders = new Set(fulfillments.filter((f) => !FAILED_FULFILLMENT.has(f.status.toUpperCase())).map((f) => f.orderId));
  const overridesBy = group(overrides, (o) => o.orderId);

  return orders
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((o) => {
      const orderSales = salesBy.get(o.id) ?? [];
      const orderLines = linesBy.get(o.id) ?? [];
      const unitCosts: Record<string, UnitCostVersion[]> = {};
      for (const l of orderLines) if (l.variantId && costsByVariant.has(l.variantId)) unitCosts[l.variantId] = costsByVariant.get(l.variantId)!;
      const input: OrderInput = {
        id: o.id,
        name: o.name,
        currency: o.currency,
        localDate: o.processedLocalDate,
        test: o.test,
        financialStatus: o.financialStatus,
        cancelled: o.cancelledAt !== null,
        fulfilled: fulfilledOrders.has(o.id),
        shippingCountryCode: o.shippingCountryCode,
        lines: orderLines.map((l) => ({ gid: l.shopifyGid, variantId: l.variantId, title: l.title, quantity: l.quantity, isGiftCard: l.isGiftCard, requiresShipping: l.requiresShipping })),
        sales: orderSales.map((s) => ({
          gid: s.saleGid,
          agreementType: s.agreementType,
          refundGid: s.refundGid,
          happenedLocalDate: s.happenedLocalDate,
          actionType: s.actionType,
          lineType: s.lineType,
          lineItemGid: s.lineItemGid,
          quantity: s.quantity,
          totalAmount: s.totalAmount,
          discountBeforeTaxes: s.totalDiscountBeforeTaxes,
          taxAmount: s.totalTaxAmount,
        })),
        refunds: (refundsBy.get(o.id) ?? []).map((r) => {
          // The refund's agreement date is the event date Shopify reports in sales; fall back to its creation date.
          const agreementDate = orderSales.filter((s) => s.refundGid === r.shopifyGid).map((s) => s.happenedLocalDate).sort()[0];
          return {
            gid: r.shopifyGid,
            localDate: agreementDate ?? localDateOf(r.createdAtShopify, store.timezone),
            lines: (refundLinesBy.get(r.id) ?? []).map(({ rl }) => ({ lineItemGid: rl.lineItemGid, quantity: rl.quantity, restockType: rl.restockType, restocked: rl.restocked })),
          };
        }),
        transactions: (txBy.get(o.id) ?? []).map((t) => ({
          gid: t.shopifyGid,
          parentGid: t.parentGid,
          kind: t.kind,
          status: t.status,
          gateway: t.gateway,
          manual: t.manualPaymentGateway,
          amount: t.amount,
          localDate: t.processedLocalDate,
          feeAmount: t.feeAmount,
          feeTaxAmount: t.feeTaxAmount,
        })),
        disputes: (disputesBy.get(o.id) ?? []).map((d) => ({ gid: d.shopifyGid, type: d.type, status: d.status, amount: d.amount, fee: d.fee, finalizedOn: d.finalizedOn })),
      };
      const ctx: OrderCostContext = {
        storeCurrency: store.currency,
        thirdPartyFeeRate: store.thirdPartyFeeRate,
        unitCosts,
        shippingRules: store.shippingRules,
        handlingRules: store.handlingRules,
        gatewayRules: store.gatewayRules,
        overrides: (overridesBy.get(o.id) ?? []).filter((x) => x.currency === store.currency).map((x) => ({ id: x.id, component: x.component, amount: x.amount })),
      };
      return { input, ctx };
    });
}
