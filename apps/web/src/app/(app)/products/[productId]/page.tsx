import type { Metadata } from "next";
import { ProductDetailView } from "@/components/reports/product-detail-view";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <ProductDetailView productId={decodeURIComponent(productId)} />;
}
