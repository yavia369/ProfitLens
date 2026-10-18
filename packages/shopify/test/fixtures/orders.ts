import type { RawOrder } from "../../src/types";

const mb = (amount: string, currencyCode = "AUD") => ({ shopMoney: { amount, currencyCode } });

/**
 * Synthetic order built to the 2026-10 schema shape (not real store data):
 * - 2 × Sneaker @ 89.95 with 10 % discount, 1 × Socks @ 24.95, shipping 9.95, GST 10 %, tip 5.00
 * - edited before fulfilment: socks quantity 1 → 2 (UPDATE sale)
 * - partially refunded 5 days later: 1 sneaker returned and restocked
 * - placed at 2026-10-03T13:30Z = 23:30 AEST on 3 Oct in Sydney (DST starts the next day)
 */
export function pagedOrder(): RawOrder {
  return {
    id: "gid://shopify/Order/5001",
    name: "#5001",
    createdAt: "2026-10-03T13:30:00Z",
    processedAt: "2026-10-03T13:30:00Z",
    updatedAt: "2026-10-08T02:00:00Z",
    cancelledAt: null,
    closedAt: null,
    test: false,
    displayFinancialStatus: "PARTIALLY_REFUNDED",
    displayFulfillmentStatus: "FULFILLED",
    currencyCode: "AUD",
    presentmentCurrencyCode: "AUD",
    taxesIncluded: false,
    sourceName: "web",
    tags: ["vip"],
    customerJourneySummary: {
      firstVisit: { landingPage: "https://example.com/", referrerUrl: null, utmParameters: null },
      lastVisit: { landingPage: "https://example.com/products/sneaker", referrerUrl: "https://www.google.com/", utmParameters: { source: "google", medium: "cpc", campaign: "brand" } },
    },
    customer: { id: "gid://shopify/Customer/77" },
    shippingAddress: { countryCodeV2: "AU" },
    subtotalPriceSet: mb("211.81"),
    totalDiscountsSet: mb("17.99"),
    totalShippingPriceSet: mb("9.95"),
    totalTaxSet: mb("22.18"),
    totalTipReceivedSet: mb("5.00"),
    totalPriceSet: mb("248.94"),
    totalRefundedSet: mb("89.06"),
    currentTotalPriceSet: mb("159.88"),
    lineItems: {
      edges: [
        {
          node: {
            id: "gid://shopify/LineItem/1",
            title: "Sneaker",
            variantTitle: "Black / 8",
            sku: "SNK-8",
            quantity: 2,
            currentQuantity: 1,
            unfulfilledQuantity: 0,
            isGiftCard: false,
            requiresShipping: true,
            originalUnitPriceSet: mb("89.95"),
            variant: { id: "gid://shopify/ProductVariant/11" },
            product: { id: "gid://shopify/Product/10" },
          },
        },
        {
          node: {
            id: "gid://shopify/LineItem/2",
            title: "Socks",
            variantTitle: null,
            sku: "SOCK",
            quantity: 2,
            currentQuantity: 2,
            unfulfilledQuantity: 0,
            isGiftCard: false,
            requiresShipping: true,
            originalUnitPriceSet: mb("24.95"),
            variant: { id: "gid://shopify/ProductVariant/21" },
            product: { id: "gid://shopify/Product/20" },
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
    agreements: {
      edges: [
        {
          node: {
            id: "gid://shopify/SalesAgreement/900",
            happenedAt: "2026-10-03T13:30:00Z",
            reason: "ORDER",
            __typename: "OrderAgreement",
            sales: {
              edges: [
                { node: { id: "gid://shopify/Sale/1", actionType: "ORDER", lineType: "PRODUCT", quantity: 2, totalAmount: mb("178.11"), totalDiscountAmountBeforeTaxes: mb("17.99"), totalDiscountAmountAfterTaxes: mb("19.79"), totalTaxAmount: mb("16.19"), lineItem: { id: "gid://shopify/LineItem/1" } } },
                { node: { id: "gid://shopify/Sale/2", actionType: "ORDER", lineType: "PRODUCT", quantity: 1, totalAmount: mb("27.45"), totalDiscountAmountBeforeTaxes: mb("0.00"), totalDiscountAmountAfterTaxes: mb("0.00"), totalTaxAmount: mb("2.50"), lineItem: { id: "gid://shopify/LineItem/2" } } },
                { node: { id: "gid://shopify/Sale/3", actionType: "ORDER", lineType: "SHIPPING", quantity: null, totalAmount: mb("10.95"), totalDiscountAmountBeforeTaxes: mb("0.00"), totalDiscountAmountAfterTaxes: mb("0.00"), totalTaxAmount: mb("1.00") } },
                { node: { id: "gid://shopify/Sale/4", actionType: "ORDER", lineType: "TIP", quantity: null, totalAmount: mb("5.00"), totalDiscountAmountBeforeTaxes: mb("0.00"), totalDiscountAmountAfterTaxes: mb("0.00"), totalTaxAmount: mb("0.00") } },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        },
        {
          node: {
            id: "gid://shopify/SalesAgreement/901",
            happenedAt: "2026-10-04T01:00:00Z",
            reason: "EDIT",
            __typename: "OrderEditAgreement",
            sales: {
              edges: [{ node: { id: "gid://shopify/Sale/5", actionType: "UPDATE", lineType: "PRODUCT", quantity: 1, totalAmount: mb("27.45"), totalDiscountAmountBeforeTaxes: mb("0.00"), totalDiscountAmountAfterTaxes: mb("0.00"), totalTaxAmount: mb("2.50"), lineItem: { id: "gid://shopify/LineItem/2" } } }],
              pageInfo: { hasNextPage: false },
            },
          },
        },
        {
          node: {
            id: "gid://shopify/SalesAgreement/902",
            happenedAt: "2026-10-08T02:00:00Z",
            reason: "REFUND",
            __typename: "RefundAgreement",
            refund: { id: "gid://shopify/Refund/300" },
            sales: {
              edges: [{ node: { id: "gid://shopify/Sale/6", actionType: "RETURN", lineType: "PRODUCT", quantity: -1, totalAmount: mb("-89.06"), totalDiscountAmountBeforeTaxes: mb("-9.00"), totalDiscountAmountAfterTaxes: mb("-9.90"), totalTaxAmount: mb("-8.10"), lineItem: { id: "gid://shopify/LineItem/1" } } }],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
    transactions: [
      {
        id: "gid://shopify/OrderTransaction/400",
        kind: "SALE",
        status: "SUCCESS",
        gateway: "shopify_payments",
        manualPaymentGateway: false,
        processedAt: "2026-10-03T13:30:05Z",
        test: false,
        parentTransaction: null,
        amountSet: mb("248.94"),
        fees: [{ amount: { amount: "4.66", currencyCode: "AUD" }, flatFee: { amount: "0.30" }, rate: "0.0175", taxAmount: { amount: "0.42" }, type: "card" }],
      },
      {
        id: "gid://shopify/OrderTransaction/401",
        kind: "REFUND",
        status: "SUCCESS",
        gateway: "shopify_payments",
        manualPaymentGateway: false,
        processedAt: "2026-10-08T02:00:03Z",
        test: false,
        parentTransaction: { id: "gid://shopify/OrderTransaction/400" },
        amountSet: mb("89.06"),
        fees: [],
      },
    ],
    refunds: [
      {
        id: "gid://shopify/Refund/300",
        createdAt: "2026-10-08T02:00:00Z",
        note: "Wrong size",
        totalRefundedSet: mb("89.06"),
        refundLineItems: {
          edges: [{ node: { id: "gid://shopify/RefundLineItem/310", quantity: 1, restockType: "RETURN", restocked: true, lineItem: { id: "gid://shopify/LineItem/1" }, subtotalSet: mb("80.96"), totalTaxSet: mb("8.10") } }],
          pageInfo: { hasNextPage: false },
        },
      },
    ],
    fulfillments: [{ id: "gid://shopify/Fulfillment/600", status: "SUCCESS", createdAt: "2026-10-04T03:00:00Z", trackingInfo: [{ company: "Australia Post" }] }],
  };
}

/** The same order as bulk JSONL lines (connections emitted as child lines with __parentId). */
export function bulkOrderLines(): string[] {
  const o = pagedOrder();
  const { lineItems, agreements, refunds, ...rest } = o;
  const root = {
    ...rest,
    refunds: refunds.map(({ refundLineItems: _rli, ...r }) => r),
  };
  const lines: unknown[] = [root];
  for (const e of (lineItems as { edges: { node: unknown }[] }).edges) lines.push({ ...(e.node as object), __parentId: o.id });
  for (const e of (agreements as { edges: { node: { id: string; sales: { edges: { node: object }[] } } }[] }).edges) {
    const { sales, ...a } = e.node;
    lines.push({ ...a, __parentId: o.id });
    for (const s of sales.edges) lines.push({ ...s.node, __parentId: e.node.id });
  }
  for (const r of refunds) {
    for (const e of (r.refundLineItems as { edges: { node: object }[] }).edges) lines.push({ ...e.node, __parentId: r.id });
  }
  return lines.map((l) => JSON.stringify(l));
}
