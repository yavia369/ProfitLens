import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Product costs" };

export default function Page() {
  return (
    <PlannedPage
      title="Product costs"
      phase={5}
      summary="Variant-level landed cost with effective dates, so past orders keep the cost that applied when they were sold."
      items={[
        "Import Shopify unit costs; override per variant with an effective date",
        "Landed cost = product cost + inbound shipping + handling",
        "Bulk edit and CSV import/export with a preview of changes",
        "Missing-cost alerts and an optional, clearly labelled fallback estimate",
      ]}
    />
  );
}
