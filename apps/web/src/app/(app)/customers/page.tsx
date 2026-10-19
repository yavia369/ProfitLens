import type { Metadata } from "next";
import { CustomersView } from "@/components/reports/customers-view";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return <CustomersView />;
}
