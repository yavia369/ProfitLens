import { PlannedPage } from "@/components/planned-page";

export const metadata = { title: "Customers" };

export default function Page() {
  return (
    <PlannedPage
      title="Customers"
      phase={7}
      summary="Retention and lifetime value, marked as observed or estimated."
      items={["Returning customer and repeat purchase rates", "Observed lifetime revenue and gross profit per customer", "First-order-month cohort tables", "Blended CAC and LTV:CAC with the method shown"]}
    />
  );
}
