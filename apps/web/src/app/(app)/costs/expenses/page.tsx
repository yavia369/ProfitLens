import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Expenses" };

export default function Page() {
  return (
    <PlannedPage
      title="Expenses"
      phase={5}
      summary="Operating costs that don't come from Shopify or ad platforms."
      items={["One-time, daily, weekly and monthly recurring expenses", "Per-order and percentage-of-revenue costs", "Categories, currencies, effective dates and an audit trail", "Spread-across-period or on-date allocation"]}
    />
  );
}
