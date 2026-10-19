import { describe, expect, it } from "vitest";
import { matchGatewayPayments, type GatewayPayment, type ShopifyPayment } from "../src/index";

const at = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00Z`);
const g = (id: string, hhmm: string, amount: string, currency = "AUD"): GatewayPayment => ({ id, occurredAt: at(hhmm), amount, currency, fee: "1.00", feeCurrency: currency });
const s = (id: string, hhmm: string, amount: string, currency = "AUD"): ShopifyPayment => ({ id, processedAt: at(hhmm), amount, currency });

describe("matching processor payments to Shopify payments", () => {
  it("matches exactly one candidate with the same amount and currency within 15 minutes", () => {
    expect(matchGatewayPayments([g("P1", "10:00", "89.95")], [s("S1", "10:12", "89.950000"), s("S2", "10:05", "89.96"), s("S3", "10:01", "89.95", "USD")])).toEqual([
      { gatewayId: "P1", status: "matched", shopifyId: "S1" },
    ]);
  });

  it("never guesses: no candidate, several candidates, or a contested candidate stay unmatched/ambiguous", () => {
    const r = matchGatewayPayments(
      [g("P1", "10:00", "50.00"), g("P2", "11:00", "20.00"), g("P3", "12:00", "30.00"), g("P4", "12:05", "30.00")],
      [s("S1", "10:16", "50.00"), s("S2", "11:01", "20.00"), s("S3", "11:02", "20.00"), s("S4", "12:03", "30.00")],
    );
    expect(r.map((x) => [x.gatewayId, x.status])).toEqual([
      ["P1", "unmatched"], // 16 minutes apart
      ["P2", "ambiguous"], // two Shopify payments of 20.00
      ["P3", "ambiguous"], // P3 and P4 both point at S4
      ["P4", "ambiguous"],
    ]);
  });
});
