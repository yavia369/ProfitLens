import { dec, localDateOf, sum, toMoneyString, type LocalDate } from "@profitlens/finance";
import { ShopifyError } from "./errors";
import { flatten, type MoneyBag, type RawDispute, type RawOrder, type RawProduct, type RawShop } from "./types";

/** Normalised, DB-agnostic facts produced from Shopify payloads (money as decimal strings, shop currency). */
export interface OrderFacts {
  order: {
    shopifyGid: string;
    name: string;
    customerGid: string | null;
    createdAtShopify: Date;
    processedAt: Date;
    processedLocalDate: LocalDate;
    cancelledAt: Date | null;
    closedAt: Date | null;
    test: boolean;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    currency: string;
    presentmentCurrency: string | null;
    sourceName: string | null;
    shippingCountryCode: string | null;
    landingSite: string | null;
    referringSite: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    tags: string[];
    subtotalPrice: string | null;
    totalDiscounts: string | null;
    totalShippingPrice: string | null;
    totalTax: string | null;
    totalTip: string | null;
    totalPrice: string | null;
    totalRefunded: string | null;
    currentTotalPrice: string | null;
    taxesIncluded: boolean;
    shopifyUpdatedAt: Date;
  };
  lineItems: {
    shopifyGid: string;
    variantGid: string | null;
    productGid: string | null;
    title: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    currentQuantity: number;
    unfulfilledQuantity: number | null;
    originalUnitPrice: string;
    isGiftCard: boolean;
    requiresShipping: boolean;
  }[];
  sales: {
    saleGid: string;
    agreementGid: string;
    agreementType: string;
    agreementReason: string | null;
    refundGid: string | null;
    happenedAt: Date;
    happenedLocalDate: LocalDate;
    actionType: "ORDER" | "RETURN" | "UPDATE" | "UNKNOWN";
    lineType: "PRODUCT" | "SHIPPING" | "TIP" | "GIFT_CARD" | "DUTY" | "FEE" | "ADDITIONAL_FEE" | "ADJUSTMENT" | "UNKNOWN";
    lineItemGid: string | null;
    quantity: number | null;
    totalAmount: string;
    totalDiscountBeforeTaxes: string;
    totalDiscountAfterTaxes: string;
    totalTaxAmount: string;
  }[];
  refunds: {
    shopifyGid: string;
    createdAtShopify: Date;
    totalRefunded: string | null;
    note: string | null;
    lineItems: {
      shopifyGid: string;
      lineItemGid: string;
      quantity: number;
      restockType: "RETURN" | "CANCEL" | "NO_RESTOCK" | "LEGACY_RESTOCK";
      restocked: boolean;
      subtotal: string | null;
      totalTax: string | null;
    }[];
  }[];
  transactions: {
    shopifyGid: string;
    parentGid: string | null;
    kind: string;
    status: string;
    gateway: string | null;
    manualPaymentGateway: boolean;
    amount: string;
    currency: string;
    processedAt: Date | null;
    processedLocalDate: LocalDate | null;
    /** Σ fee amounts when Shopify reports fees (Shopify Payments); null when it reports none. */
    feeAmount: string | null;
    feeTaxAmount: string | null;
    feeRate: string | null;
    feeFlat: string | null;
  }[];
  fulfillments: { shopifyGid: string; status: string; createdAtShopify: Date; trackingCompany: string | null }[];
}

const m = (b: MoneyBag | null | undefined): string | null => (b ? toMoneyString(dec(b.shopMoney.amount)) : null);
const mReq = (b: MoneyBag, field: string): string => {
  const v = m(b);
  if (v === null) throw new ShopifyError(`missing money field ${field}`, "graphql");
  return v;
};
const date = (s: string | null): Date | null => (s ? new Date(s) : null);

export function mapOrder(raw: RawOrder, timezone: string): OrderFacts {
  const processedAt = new Date(raw.processedAt);
  const visit = raw.customerJourneySummary?.lastVisit ?? raw.customerJourneySummary?.firstVisit ?? null;
  const shopCurrency = raw.currencyCode;
  return {
    order: {
      shopifyGid: raw.id,
      name: raw.name,
      customerGid: raw.customer?.id ?? null,
      createdAtShopify: new Date(raw.createdAt),
      processedAt,
      processedLocalDate: localDateOf(processedAt, timezone),
      cancelledAt: date(raw.cancelledAt),
      closedAt: date(raw.closedAt),
      test: raw.test,
      financialStatus: raw.displayFinancialStatus,
      fulfillmentStatus: raw.displayFulfillmentStatus,
      currency: shopCurrency,
      presentmentCurrency: raw.presentmentCurrencyCode,
      sourceName: raw.sourceName,
      shippingCountryCode: raw.shippingAddress?.countryCodeV2 ?? null,
      landingSite: visit?.landingPage ?? null,
      referringSite: visit?.referrerUrl ?? null,
      utmSource: visit?.utmParameters?.source ?? null,
      utmMedium: visit?.utmParameters?.medium ?? null,
      utmCampaign: visit?.utmParameters?.campaign ?? null,
      tags: raw.tags ?? [],
      subtotalPrice: m(raw.subtotalPriceSet),
      totalDiscounts: m(raw.totalDiscountsSet),
      totalShippingPrice: m(raw.totalShippingPriceSet),
      totalTax: m(raw.totalTaxSet),
      totalTip: m(raw.totalTipReceivedSet),
      totalPrice: m(raw.totalPriceSet),
      totalRefunded: m(raw.totalRefundedSet),
      currentTotalPrice: m(raw.currentTotalPriceSet),
      taxesIncluded: raw.taxesIncluded,
      shopifyUpdatedAt: new Date(raw.updatedAt),
    },
    lineItems: flatten(raw.lineItems).map((li) => ({
      shopifyGid: li.id,
      variantGid: li.variant?.id ?? null,
      productGid: li.product?.id ?? null,
      title: li.title,
      variantTitle: li.variantTitle,
      sku: li.sku,
      quantity: li.quantity,
      currentQuantity: li.currentQuantity,
      unfulfilledQuantity: li.unfulfilledQuantity,
      originalUnitPrice: mReq(li.originalUnitPriceSet, "originalUnitPriceSet"),
      isGiftCard: li.isGiftCard,
      requiresShipping: li.requiresShipping,
    })),
    sales: flatten(raw.agreements).flatMap((a) => {
      const happenedAt = new Date(a.happenedAt);
      const happenedLocalDate = localDateOf(happenedAt, timezone);
      return flatten(a.sales).map((s) => ({
        saleGid: s.id,
        agreementGid: a.id,
        agreementType: a.__typename,
        agreementReason: a.reason,
        refundGid: a.refund?.id ?? null,
        happenedAt,
        happenedLocalDate,
        actionType: s.actionType,
        lineType: s.lineType,
        lineItemGid: s.lineItem?.id ?? null,
        quantity: s.quantity,
        totalAmount: mReq(s.totalAmount, "totalAmount"),
        totalDiscountBeforeTaxes: mReq(s.totalDiscountAmountBeforeTaxes, "totalDiscountAmountBeforeTaxes"),
        totalDiscountAfterTaxes: mReq(s.totalDiscountAmountAfterTaxes, "totalDiscountAmountAfterTaxes"),
        totalTaxAmount: mReq(s.totalTaxAmount, "totalTaxAmount"),
      }));
    }),
    refunds: raw.refunds.map((r) => ({
      shopifyGid: r.id,
      createdAtShopify: new Date(r.createdAt),
      totalRefunded: m(r.totalRefundedSet),
      note: r.note,
      lineItems: flatten(r.refundLineItems).map((rl) => ({
        shopifyGid: rl.id,
        lineItemGid: rl.lineItem.id,
        quantity: rl.quantity,
        restockType: rl.restockType,
        restocked: rl.restocked,
        subtotal: m(rl.subtotalSet),
        totalTax: m(rl.totalTaxSet),
      })),
    })),
    transactions: raw.transactions.map((t) => {
      const processed = date(t.processedAt);
      // Fees are reported in the shop's settlement currency; only sum fees in the shop currency.
      const fees = t.fees.filter((f) => f.amount.currencyCode === shopCurrency);
      const hasFees = fees.length > 0;
      return {
        shopifyGid: t.id,
        parentGid: t.parentTransaction?.id ?? null,
        kind: t.kind,
        status: t.status,
        gateway: t.gateway,
        manualPaymentGateway: t.manualPaymentGateway,
        amount: mReq(t.amountSet, "amountSet"),
        currency: t.amountSet.shopMoney.currencyCode,
        processedAt: processed,
        processedLocalDate: processed ? localDateOf(processed, timezone) : null,
        feeAmount: hasFees ? toMoneyString(sum(fees.map((f) => dec(f.amount.amount)))) : null,
        feeTaxAmount: hasFees ? toMoneyString(sum(fees.map((f) => dec(f.taxAmount?.amount ?? "0")))) : null,
        feeRate: fees.length === 1 && fees[0]!.rate ? toMoneyString(dec(fees[0]!.rate)) : null,
        feeFlat: fees.length === 1 && fees[0]!.flatFee ? toMoneyString(dec(fees[0]!.flatFee.amount)) : null,
      };
    }),
    fulfillments: (raw.fulfillments ?? []).map((f) => ({
      shopifyGid: f.id,
      status: f.status,
      createdAtShopify: new Date(f.createdAt),
      trackingCompany: f.trackingInfo[0]?.company ?? null,
    })),
  };
}

export interface ProductFacts {
  product: { shopifyGid: string; title: string; status: string | null; productType: string | null; vendor: string | null; shopifyUpdatedAt: Date | null };
  variants: {
    shopifyGid: string;
    inventoryItemGid: string | null;
    title: string;
    sku: string | null;
    price: string | null;
    /** Shopify "cost per item" in shop currency; null when not set. */
    unitCost: string | null;
    unitCostCurrency: string | null;
    weightGrams: number | null;
    requiresShipping: boolean | null;
    shopifyUpdatedAt: Date | null;
  }[];
}

const GRAMS: Record<string, number> = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.349523125, POUNDS: 453.59237 };

export function mapProduct(raw: RawProduct): ProductFacts {
  return {
    product: {
      shopifyGid: raw.id,
      title: raw.title,
      status: raw.status,
      productType: raw.productType,
      vendor: raw.vendor,
      shopifyUpdatedAt: date(raw.updatedAt),
    },
    variants: flatten(raw.variants).map((v) => {
      const w = v.inventoryItem?.measurement?.weight;
      const factor = w ? GRAMS[w.unit] : undefined;
      return {
        shopifyGid: v.id,
        inventoryItemGid: v.inventoryItem?.id ?? null,
        title: v.title,
        sku: v.sku || null,
        price: v.price === null ? null : toMoneyString(dec(v.price)),
        unitCost: v.inventoryItem?.unitCost ? toMoneyString(dec(v.inventoryItem.unitCost.amount)) : null,
        unitCostCurrency: v.inventoryItem?.unitCost?.currencyCode ?? null,
        // Weight is physical data (not money); integer grams.
        weightGrams: w && factor !== undefined ? Math.round(w.value * factor) : null,
        requiresShipping: v.inventoryItem?.requiresShipping ?? null,
        shopifyUpdatedAt: date(v.updatedAt),
      };
    }),
  };
}

export interface DisputeFacts {
  shopifyGid: string;
  orderGid: string | null;
  type: string;
  status: string;
  reason: string | null;
  amount: string;
  currency: string;
  initiatedAt: Date | null;
  finalizedOn: string | null;
}

export function mapDispute(raw: RawDispute): DisputeFacts {
  return {
    shopifyGid: raw.id,
    orderGid: raw.order?.id ?? null,
    type: raw.type,
    status: raw.status,
    reason: raw.reasonDetails?.reason ?? null,
    amount: toMoneyString(dec(raw.amount.amount)),
    currency: raw.amount.currencyCode,
    initiatedAt: date(raw.initiatedAt),
    finalizedOn: raw.finalizedOn,
  };
}

export interface ShopFacts {
  shopGid: string;
  name: string;
  shopDomain: string;
  currency: string;
  ianaTimezone: string;
  plan: string | null;
  /** Shopify's fee on third-party gateways for the plan (percent), when known. */
  thirdPartyFeeRate: string | null;
}

/** Third-party transaction fee by plan (DOCUMENTED via TrueProfit help centre; Shopify states 0.5–2 %). Verify per store. */
const THIRD_PARTY_FEE: Record<string, string> = { basic: "2.0", grow: "1.0", shopify: "1.0", advanced: "0.6" };

export function mapShop(raw: RawShop): ShopFacts {
  const plan = raw.plan.publicDisplayName ?? raw.plan.displayName;
  const key = (plan ?? "").toLowerCase().replace(/\s+shopify$/, "").trim();
  return {
    shopGid: raw.id,
    name: raw.name,
    shopDomain: raw.myshopifyDomain,
    currency: raw.currencyCode,
    ianaTimezone: raw.ianaTimezone,
    plan,
    thirdPartyFeeRate: raw.plan.shopifyPlus ? "0" : (THIRD_PARTY_FEE[key] ?? null),
  };
}
