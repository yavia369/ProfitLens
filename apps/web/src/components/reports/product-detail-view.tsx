"use client";

import type { ProductDetailReport, StoreSummary } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ProductSalesChart } from "@/components/charts/product-sales-chart";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { formatCount, formatMoney, formatPercent, signOf } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";
import { Stat, StatGrid } from "./stat";
import { CostStatusBadge } from "./status-badge";

export function ProductDetailView({ productId }: { productId: string }) {
  const [params, , qs] = useReportParams();
  const q = useQuery({
    queryKey: ["product", productId, qs],
    queryFn: () => apiGet<ProductDetailReport>(`/api/reports/products/${encodeURIComponent(productId)}?${qs}`),
    placeholderData: (prev) => prev,
    retry: false,
  });
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = stores.data?.stores.find((s) => s.id === params.store);
  const r = q.data;
  const currency = r?.store.currency ?? current?.currency ?? "USD";
  const money = (v: string | null) => formatMoney(v, currency);
  const missingCost = r?.totals.costStatus === "missing";

  return (
    <div>
      <Link href={`/products?${qs}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Products
      </Link>
      <ReportToolbar title={r?.product.title ?? "Product"} description="All variants of this product over the selected range." resolved={r?.range} showCompare={false} isFetching={q.isFetching} />
      {current?.isDemo ? <DemoBanner /> : null}
      {q.isError ? <Alert tone="warning" title="Couldn't load this product">{(q.error as Error).message}</Alert> : null}
      {missingCost ? (
        <Alert tone="warning" title="Some variants have no cost" className="mb-4">
          Their COGS is counted as zero, so gross profit and profit after ads are overstated.
        </Alert>
      ) : null}
      {!r ? (
        q.isError ? null : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-72" />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <StatGrid title="Sales" description="Event-dated: returns count on the day they are refunded.">
            <Stat label="Units sold" value={formatCount(r.totals.unitsSold)} />
            <Stat label="Net sales" value={money(r.totals.netSales)} note={`${formatPercent(r.totals.shareOfNetSales)} of all product sales`} />
            <Stat label="Returns" value={formatMoney(r.totals.returns, currency, { asCost: true })} />
            <Stat label="COGS" value={formatMoney(r.totals.cogs, currency, { asCost: true })} warning={missingCost ? "Some variants have no cost" : null} />
            <Stat label="Gross profit" value={money(r.totals.grossProfit)} warning={missingCost ? "Overstated: some variants have no cost" : null} />
            <Stat label="Gross margin" value={formatPercent(r.totals.grossMargin)} />
          </StatGrid>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ad spend share (estimates)</CardTitle>
                <CardDescription>
                  Store ad spend of {money(r.allocations[0]?.adSpend ?? "0")} spread over products by two methods. These are allocations, not
                  attribution: they say what this product would carry, not what its ads earned.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Method</TH>
                    <TH className="text-right">Ad spend carried</TH>
                    <TH className="pr-5 text-right">Gross profit after ads</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.allocations.map((a) => (
                    <TR key={a.method}>
                      <TD className="whitespace-normal pl-5">
                        <p className="font-medium">{a.label}</p>
                        <p className="text-xs text-subtle">{a.description}</p>
                      </TD>
                      <TD className="text-right tabular">{formatMoney(a.allocated, currency, { asCost: true })}</TD>
                      <TD className={cn("pr-5 text-right font-medium tabular", signOf(a.profitAfterAds) === -1 && "text-negative")}>{money(a.profitAfterAds)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <ProductSalesChart series={r.series} currency={currency} />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Variants</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Variant</TH>
                    <TH>SKU</TH>
                    <TH className="text-right">Units</TH>
                    <TH className="text-right">Net sales</TH>
                    <TH className="text-right">COGS</TH>
                    <TH className="text-right">Gross profit</TH>
                    <TH className="text-right">Margin</TH>
                    <TH className="pr-5">Cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.variants.map((v) => (
                    <TR key={v.variantId}>
                      <TD className="pl-5">{v.variantTitle || "Default"}</TD>
                      <TD className="text-muted-foreground">{v.sku}</TD>
                      <TD className="text-right tabular">{formatCount(v.unitsSold)}</TD>
                      <TD className="text-right tabular">{money(v.netSales)}</TD>
                      <TD className="text-right tabular text-muted-foreground">{formatMoney(v.cogs, currency, { asCost: true })}</TD>
                      <TD className={cn("text-right font-medium tabular", signOf(v.grossProfit) === -1 && "text-negative")}>{money(v.grossProfit)}</TD>
                      <TD className="text-right tabular">{formatPercent(v.grossMargin)}</TD>
                      <TD className="pr-5">
                        <CostStatusBadge status={v.costStatus} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
