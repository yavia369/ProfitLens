import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Transaction fees" };

export default function Page() {
  return (
    <PlannedPage
      title="Transaction fees"
      phase={5}
      summary="Actual Shopify Payments fees when Shopify reports them, configured rates otherwise."
      items={["Per-gateway percentage + fixed fee rules", "Shopify third-party transaction fee by plan", "Source shown on every order: actual, rule or missing", "Option to treat GST/VAT on fees as recoverable"]}
    />
  );
}
