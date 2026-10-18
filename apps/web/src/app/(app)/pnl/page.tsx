import type { Metadata } from "next";
import { PnlView } from "@/components/reports/pnl-view";

export const metadata: Metadata = { title: "Profit & loss" };

export default function PnlPage() {
  return <PnlView />;
}
