/**
 * GraphQL documents (Admin API 2026-10). The order selection is shared by the bulk backfill (connections
 * without pagination arguments) and the paged incremental sync (connections with `first`).
 * Bulk constraints: ≤ 5 connections, ≤ 2 levels of connection nesting, and no connection inside a list
 * field (verified live 2026-10-19). `refunds` is a list, so bulk exports omit its `refundLineItems`
 * connection; the backfill refetches refunded orders with the paged query (see `hasTruncatedConnections`).
 */

const money = "shopMoney { amount currencyCode }";

function conn(name: string, paged: boolean, first: number, body: string, extraArgs = ""): string {
  const args = [paged ? `first: ${first}` : "", extraArgs].filter(Boolean).join(", ");
  return `${name}${args ? `(${args})` : ""} { edges { node { ${body} } }${paged ? " pageInfo { hasNextPage }" : ""} }`;
}

export function orderSelection(paged: boolean): string {
  const sale = `id actionType lineType quantity
    totalAmount { ${money} }
    totalDiscountAmountBeforeTaxes { ${money} }
    totalDiscountAmountAfterTaxes { ${money} }
    totalTaxAmount { ${money} }
    ... on ProductSale { lineItem { id } }`;
  return `
    id name createdAt processedAt updatedAt cancelledAt closedAt test
    displayFinancialStatus displayFulfillmentStatus
    currencyCode presentmentCurrencyCode taxesIncluded sourceName tags
    customerJourneySummary {
      firstVisit { landingPage referrerUrl utmParameters { source medium campaign } }
      lastVisit { landingPage referrerUrl utmParameters { source medium campaign } }
    }
    customer { id }
    shippingAddress { countryCodeV2 }
    subtotalPriceSet { ${money} }
    totalDiscountsSet { ${money} }
    totalShippingPriceSet { ${money} }
    totalTaxSet { ${money} }
    totalTipReceivedSet { ${money} }
    totalPriceSet { ${money} }
    totalRefundedSet { ${money} }
    currentTotalPriceSet { ${money} }
    ${conn(
      "lineItems",
      paged,
      100,
      `id title variantTitle sku quantity currentQuantity unfulfilledQuantity isGiftCard requiresShipping
       originalUnitPriceSet { ${money} } variant { id } product { id }`,
    )}
    ${conn(
      "agreements",
      paged,
      50,
      `id happenedAt reason __typename ... on RefundAgreement { refund { id } }
       ${conn("sales", paged, 100, sale)}`,
    )}
    transactions(first: 50) {
      id kind status gateway manualPaymentGateway processedAt test
      parentTransaction { id }
      amountSet { ${money} }
      fees { amount { amount currencyCode } flatFee { amount } rate taxAmount { amount } type }
    }
    refunds(first: 50) {
      id createdAt note
      totalRefundedSet { ${money} }
      ${
        paged
          ? conn("refundLineItems", paged, 100, `id quantity restockType restocked lineItem { id } subtotalSet { ${money} } totalTaxSet { ${money} }`)
          : ""
      }
    }
    fulfillments(first: 20) { id status createdAt trackingInfo(first: 1) { company } }
  `;
}

export const SHOP_QUERY = `
  query ShopInfo {
    shop {
      id name myshopifyDomain currencyCode ianaTimezone taxesIncluded
      plan { displayName publicDisplayName shopifyPlus partnerDevelopment }
    }
  }`;

/** Search syntax filter for orders updated at/after an instant (Shopify order search). */
export function ordersUpdatedSince(sinceIso: string): string {
  return `updated_at:>='${sinceIso}'`;
}

export function ordersCreatedBetween(fromIso: string, toIso: string): string {
  return `created_at:>='${fromIso}' AND created_at:<'${toIso}'`;
}

export function bulkOrdersQuery(searchQuery: string): string {
  return `{ orders(query: ${JSON.stringify(searchQuery)}, sortKey: UPDATED_AT) { edges { node { ${orderSelection(false)} } } } }`;
}

export const PAGED_ORDERS_QUERY = `
  query OrdersPage($query: String!, $after: String) {
    orders(first: 10, after: $after, query: $query, sortKey: UPDATED_AT) {
      edges { cursor node { ${orderSelection(true)} } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const ORDER_BY_ID_QUERY = `
  query OrderById($id: ID!) {
    order(id: $id) { ${orderSelection(true)} }
  }`;

const productBody = (paged: boolean) => `
  id title status productType vendor updatedAt
  ${conn(
    "variants",
    paged,
    100,
    `id title sku price updatedAt
     inventoryItem { id requiresShipping unitCost { amount currencyCode } measurement { weight { value unit } } }`,
  )}`;

export function bulkProductsQuery(): string {
  return `{ products { edges { node { ${productBody(false)} } } } }`;
}

export const PAGED_PRODUCTS_QUERY = `
  query ProductsPage($after: String, $query: String) {
    products(first: 20, after: $after, query: $query) {
      edges { node { ${productBody(true)} } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

/**
 * Top-level `disputes` (not `shopifyPaymentsAccount.disputes`, which also needs `read_shopify_payments_accounts`;
 * verified live 2026-10-19).
 */
export const DISPUTES_QUERY = `
  query Disputes($after: String) {
    disputes(first: 50, after: $after) {
      edges { node { id type status initiatedAt finalizedOn amount { amount currencyCode } reasonDetails { reason } order { id } } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const ORDERS_COUNT_QUERY = `
  query OrdersCount($query: String!) {
    ordersCount(query: $query, limit: null) { count precision }
  }`;

export const BULK_RUN_MUTATION = `
  mutation RunBulk($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message code }
    }
  }`;

export const BULK_STATUS_QUERY = `
  query BulkStatus($id: ID!) {
    node(id: $id) {
      ... on BulkOperation { id status errorCode objectCount rootObjectCount url partialDataUrl createdAt completedAt }
    }
  }`;
