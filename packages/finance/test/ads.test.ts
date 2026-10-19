import { describe, expect, it } from "vitest";
import { attributeCampaigns, belowBreakEven, dec, platformForUtmSource, type CampaignSpendRow, type UtmRow } from "../src/index";

const campaign = (platform: CampaignSpendRow["platform"], campaignId: string, campaignName: string, spend: string | null, platformValue: string | null = null): CampaignSpendRow => ({
  platform,
  accountName: "Acct",
  campaignId,
  campaignName,
  source: "api",
  attributable: true,
  spend,
  platformValue,
  clicks: null,
  otherTimezone: false,
});
const utm = (source: string | null, campaign: string | null, orders: number, revenue: string, orderProfit: string, medium: string | null = "cpc"): UtmRow => ({ source, medium, campaign, orders, revenue, orderProfit });

describe("UTM-modeled campaign attribution", () => {
  const campaigns = [
    campaign("google_ads", "111", "Brand Search", "100", "420"),
    campaign("google_ads", "222", "Shopping AU", "300", "600"),
    campaign("meta", "9001", "Prospecting", "200"),
    campaign("meta", "9002", "prospecting", "50"), // same name as 9001 (case-insensitive)
  ];
  const rows = [
    utm("google", "brand search", 3, "240", "90"), // by name, case-insensitive
    utm("Google", "222", 2, "150", "40"), // by id ({campaignid} ValueTrack)
    utm("facebook", "Prospecting", 4, "300", "120"), // two Meta campaigns share the name
    utm("google", "Old campaign", 1, "80", "30"), // no such campaign
    utm("newsletter", "october", 5, "400", "180", "email"), // not an ad platform
    utm(null, null, 7, "500", "200", null), // no UTM
  ];
  const a = attributeCampaigns(campaigns, rows);

  it("credits orders to exactly one matching campaign by name or id", () => {
    const [brand, shopping] = a.campaigns;
    expect(brand).toMatchObject({ utmOrders: 3 });
    expect(brand!.utmRevenue!.toString()).toBe("240");
    expect(brand!.utmRoas!.toString()).toBe("2.4");
    expect(brand!.utmProfitAfterAds!.toString()).toBe("-10");
    expect(brand!.platformRoas!.toString()).toBe("4.2");
    expect(shopping!.utmOrders).toBe(2);
    expect(shopping!.utmProfitAfterAds!.toString()).toBe("-260");
  });

  it("never guesses: ambiguous, unknown, non-ad and missing UTMs stay unattributed", () => {
    expect(a.campaigns[2]!.utmOrders! + a.campaigns[3]!.utmOrders!).toBe(0);
    expect(a.unattributed.map((g) => [g.reason, g.orders])).toEqual([
      ["no_utm", 7],
      ["not_paid_platform", 5],
      ["ambiguous", 4],
      ["no_matching_campaign", 1],
    ]);
    // Nothing is lost: attributed + unattributed revenue = all UTM revenue.
    const total = [...a.campaigns.map((c) => c.utmRevenue!), ...a.unattributed.map((g) => g.revenue)].reduce((s, x) => s.plus(x), dec("0"));
    expect(total.toString()).toBe("1670");
  });

  it("does not attribute to account-level spend; its platform's UTM traffic is reported as such", () => {
    const manual = { ...campaign("tiktok", "manual:1", "Manual entries", "90"), source: "manual" as const, attributable: false };
    const r = attributeCampaigns([manual], [utm("tiktok", "Manual entries", 2, "100", "40")]);
    expect(r.campaigns[0]).toMatchObject({ utmOrders: null, utmRevenue: null, utmRoas: null, utmProfitAfterAds: null });
    expect(r.unattributed).toEqual([expect.objectContaining({ reason: "no_campaign_data", platform: "tiktok", orders: 2 })]);
  });

  it("leaves ROAS unknown when spend is unknown (missing exchange rate)", () => {
    const r = attributeCampaigns([campaign("google_ads", "1", "X", null, "10")], [utm("google", "x", 1, "50", "20")]);
    expect(r.campaigns[0]).toMatchObject({ spend: null, platformRoas: null, utmRoas: null, utmProfitAfterAds: null, utmOrders: 1 });
  });

  it("maps UTM sources to platforms and compares with break-even", () => {
    expect(platformForUtmSource(" Instagram ")).toBe("meta");
    expect(platformForUtmSource("bing")).toBeNull();
    expect(belowBreakEven(dec("2.4"), dec("2.5"))).toBe(true);
    expect(belowBreakEven(null, dec("2.5"))).toBeNull();
  });
});
