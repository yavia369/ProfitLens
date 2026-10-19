import type { Metadata } from "next";
import { AdvertisingView } from "@/components/reports/advertising-view";

export const metadata: Metadata = { title: "Advertising" };

export default function AdvertisingPage() {
  return <AdvertisingView />;
}
