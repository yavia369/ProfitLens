/** Raw GraphQL shapes (subset selected in queries.ts). Connections are normalised to arrays by `flatten`. */

export interface MoneyBag {
  shopMoney: { amount: string; currencyCode: string };
}

export interface Edges<T> {
  edges: { node: T }[];
  pageInfo?: { hasNextPage: boolean };
}

export type MaybeEdges<T> = Edges<T> | T[];

export interface RawSale {
  id: string;
  actionType: "ORDER" | "RETURN" | "UPDATE" | "UNKNOWN";
  lineType: "PRODUCT" | "SHIPPING" | "TIP" | "GIFT_CARD" | "DUTY" | "FEE" | "ADDITIONAL_FEE" | "ADJUSTMENT" | "UNKNOWN";
  quantity: number | null;
  totalAmount: MoneyBag;
  totalDiscountAmountBeforeTaxes: MoneyBag;
  totalDiscountAmountAfterTaxes: MoneyBag;
  totalTaxAmount: MoneyBag;
  lineItem?: { id: string } | null;
}

export interface RawAgreement {
  id: string;
  happenedAt: string;
  reason: string | null;
  __typename: string;
  refund?: { id: string } | null;
  sales: MaybeEdges<RawSale>;
}

export interface RawLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  currentQuantity: number;
  unfulfilledQuantity: number | null;
  isGiftCard: boolean;
  requiresShipping: boolean;
  originalUnitPriceSet: MoneyBag;
  variant: { id: string } | null;
  product: { id: string } | null;
}

export interface RawTransaction {
  id: string;
  kind: string;
  status: string;
  gateway: string | null;
  manualPaymentGateway: boolean;
  processedAt: string | null;
  test: boolean;
  parentTransaction: { id: string } | null;
  amountSet: MoneyBag;
  fees: { amount: { amount: string; currencyCode: string }; flatFee: { amount: string } | null; rate: string | null; taxAmount: { amount: string } | null; type: string }[];
}

export interface RawRefundLineItem {
  id: string;
  quantity: number;
  restockType: "RETURN" | "CANCEL" | "NO_RESTOCK" | "LEGACY_RESTOCK";
  restocked: boolean;
  lineItem: { id: string };
  subtotalSet: MoneyBag | null;
  totalTaxSet: MoneyBag | null;
}

export interface RawRefund {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: MoneyBag | null;
  refundLineItems: MaybeEdges<RawRefundLineItem>;
}

export interface RawVisit {
  landingPage: string | null;
  referrerUrl: string | null;
  utmParameters: { source: string | null; medium: string | null; campaign: string | null } | null;
}

export interface RawOrder {
  id: string;
  name: string;
  createdAt: string;
  processedAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  closedAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  presentmentCurrencyCode: string | null;
  taxesIncluded: boolean;
  sourceName: string | null;
  tags: string[];
  customerJourneySummary: { firstVisit: RawVisit | null; lastVisit: RawVisit | null } | null;
  customer: { id: string } | null;
  shippingAddress: { countryCodeV2: string | null } | null;
  subtotalPriceSet: MoneyBag | null;
  totalDiscountsSet: MoneyBag | null;
  totalShippingPriceSet: MoneyBag | null;
  totalTaxSet: MoneyBag | null;
  totalTipReceivedSet: MoneyBag | null;
  totalPriceSet: MoneyBag | null;
  totalRefundedSet: MoneyBag | null;
  currentTotalPriceSet: MoneyBag | null;
  lineItems: MaybeEdges<RawLineItem>;
  agreements: MaybeEdges<RawAgreement>;
  transactions: RawTransaction[];
  refunds: RawRefund[];
  fulfillments: { id: string; status: string; createdAt: string; trackingInfo: { company: string | null }[] }[];
}

export interface RawVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string | null;
  updatedAt: string | null;
  inventoryItem: {
    id: string;
    requiresShipping: boolean | null;
    unitCost: { amount: string; currencyCode: string } | null;
    measurement: { weight: { value: number; unit: string } | null } | null;
  } | null;
}

export interface RawProduct {
  id: string;
  title: string;
  status: string | null;
  productType: string | null;
  vendor: string | null;
  updatedAt: string | null;
  variants: MaybeEdges<RawVariant>;
}

export interface RawDispute {
  id: string;
  type: string;
  status: string;
  initiatedAt: string | null;
  finalizedOn: string | null;
  amount: { amount: string; currencyCode: string };
  reasonDetails: { reason: string | null } | null;
  order: { id: string } | null;
}

export interface RawShop {
  id: string;
  name: string;
  myshopifyDomain: string;
  currencyCode: string;
  ianaTimezone: string;
  taxesIncluded: boolean;
  plan: { displayName: string | null; publicDisplayName: string | null; shopifyPlus: boolean; partnerDevelopment: boolean };
}

export function flatten<T>(c: MaybeEdges<T> | null | undefined): T[] {
  if (!c) return [];
  return Array.isArray(c) ? c : c.edges.map((e) => e.node);
}

/** True if any nested connection reports more pages than were fetched (paged queries only). */
export function hasTruncatedConnections(order: RawOrder): boolean {
  const more = (c: MaybeEdges<unknown>) => !Array.isArray(c) && c.pageInfo?.hasNextPage === true;
  return more(order.lineItems) || more(order.agreements) || flatten(order.agreements).some((a) => more(a.sales)) || order.refunds.some((r) => more(r.refundLineItems));
}
