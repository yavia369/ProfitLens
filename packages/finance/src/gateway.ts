import { dec, type MoneyString } from "./money";

/** A payment as the processor reports it (PayPal, Stripe), normalised: positive gross amount and fee. */
export interface GatewayPayment {
  readonly id: string;
  readonly occurredAt: Date;
  readonly amount: MoneyString;
  readonly currency: string;
  readonly fee: MoneyString;
  readonly feeCurrency: string;
}

/** A successful Shopify SALE/CAPTURE on the same gateway, in the currency Shopify recorded. */
export interface ShopifyPayment {
  readonly id: string;
  readonly processedAt: Date;
  readonly amount: MoneyString;
  readonly currency: string;
}

export type GatewayMatch =
  | { readonly gatewayId: string; readonly status: "matched"; readonly shopifyId: string }
  | { readonly gatewayId: string; readonly status: "unmatched" | "ambiguous"; readonly reason: string };

/** How far apart the processor's timestamp and Shopify's may be (D-052). */
export const GATEWAY_MATCH_MINUTES = 15;

/**
 * Matches processor payments to Shopify payments by amount + currency + time (D-052): a match needs exactly one
 * Shopify candidate within ±15 minutes, and that candidate must not be claimed by another processor payment.
 * Anything else stays unmatched or ambiguous with the reason, so its fee keeps the rule estimate (never guessed).
 */
export function matchGatewayPayments(gateway: readonly GatewayPayment[], shopify: readonly ShopifyPayment[], windowMinutes = GATEWAY_MATCH_MINUTES): GatewayMatch[] {
  const window = windowMinutes * 60_000;
  const candidates = new Map<string, ShopifyPayment[]>();
  const claims = new Map<string, number>();
  for (const g of gateway) {
    const amount = dec(g.amount);
    const list = shopify.filter((s) => s.currency === g.currency && dec(s.amount).eq(amount) && Math.abs(s.processedAt.getTime() - g.occurredAt.getTime()) <= window);
    candidates.set(g.id, list);
    if (list.length === 1) claims.set(list[0]!.id, (claims.get(list[0]!.id) ?? 0) + 1);
  }
  return gateway.map((g) => {
    const list = candidates.get(g.id)!;
    if (list.length === 0) return { gatewayId: g.id, status: "unmatched", reason: `No Shopify payment of ${g.amount} ${g.currency} within ${windowMinutes} minutes` };
    if (list.length > 1) return { gatewayId: g.id, status: "ambiguous", reason: `${list.length} Shopify payments of the same amount within ${windowMinutes} minutes` };
    if (claims.get(list[0]!.id)! > 1) return { gatewayId: g.id, status: "ambiguous", reason: "Another processor payment matches the same Shopify payment" };
    return { gatewayId: g.id, status: "matched", shopifyId: list[0]!.id };
  });
}
