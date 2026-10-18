import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Sync center" };

export default function Page() {
  return (
    <PlannedPage
      title="Sync center"
      phase={4}
      summary="Status of every data source and job."
      items={["Shopify historical import progress and incremental sync status", "Webhook delivery and reconciliation results against Shopify totals", "Ad platform sync status, last success and next run", "Error log with retry"]}
    />
  );
}
