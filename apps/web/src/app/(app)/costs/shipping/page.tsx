import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Shipping costs" };

export default function Page() {
  return (
    <PlannedPage
      title="Shipping costs"
      phase={5}
      summary="What you pay carriers — kept separate from shipping charged to customers."
      items={["Per-order, per-item, first + additional item and quantity-tier rules", "Rules by destination country with effective dates", "Manual per-order overrides with an audit trail", "Preview of the rule applied to an example order"]}
    />
  );
}
