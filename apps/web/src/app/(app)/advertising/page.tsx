import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Advertising" };

export default function Page() {
  return (
    <PlannedPage
      title="Advertising"
      phase={7}
      summary="Campaign-level spend and profitability, with clearly separated attribution methods."
      items={[
        "Spend, ROAS, MER, CPA and CAC per channel and campaign (Google Ads first — phase 6 sync)",
        "Break-even ROAS and break-even CPA from your contribution margin",
        "Platform-reported conversions vs Shopify orders vs modeled attribution, each labelled",
        "Store-wide blended profitability when campaign attribution isn't reliable",
      ]}
    />
  );
}
