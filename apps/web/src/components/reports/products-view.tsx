"use client";

import type { ProductRow, ProductsReport, StoreSummary } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Boxes, Download, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCount, formatMoney, formatPercent, signOf } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";
import { CostStatusBadge } from "./status-badge";

type SortKey = "unitsSold" | "netSales" | "grossProfit" | "grossMargin";
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "unitsSold", label: "Units" },
  { key: "netSales", label: "Net sales" },
  { key: "grossProfit", label: "Gross profit" },
  { key: "grossMargin", label: "Margin" },
];

// Ordering only (no arithmetic on money): compares decimal strings by numeric value.
const orderValue = (r: ProductRow, k: SortKey): number => (k === "unitsSold" ? r.unitsSold : r[k] === null ? Number.NEGATIVE_INFINITY : Number(r[k]));

export function ProductsView() {
  const [params, , qs] = useReportParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "loss" | "missing">("all");
  const [sort, setSort] = useState<SortKey>("grossProfit");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [allocation, setAllocation] = useState<"none" | "revenue" | "units">("none");
  const q = useQuery({
    queryKey: ["products", qs, allocation],
    queryFn: () => apiGet<ProductsReport>(`/api/reports/products?${qs}&allocation=${allocation}`),
    placeholderData: (prev) => prev,
  });
  const alloc = q.data?.allocation ?? null;
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = stores.data?.stores.find((s) => s.id === params.store);
  const currency = q.data?.currency ?? current?.currency ?? "USD";

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.rows ?? [])
      .filter((r) => !s || `${r.productTitle} ${r.variantTitle} ${r.sku}`.toLowerCase().includes(s))
      .filter((r) => filter === "all" || (filter === "loss" ? signOf(r.grossProfit) === -1 : r.costStatus === "missing"))
      .sort((a, b) => (orderValue(a, sort) - orderValue(b, sort)) * (dir === "asc" ? 1 : -1));
  }, [q.data, search, filter, sort, dir]);
  const missing = (q.data?.rows ?? []).filter((r) => r.costStatus === "missing").length;

  const exportCsv = () =>
    downloadCsv(
      `products_${q.data?.range.start}_${q.data?.range.end}.csv`,
      toCsv(
        ["product", "variant", "sku", "units_sold", "gross_sales", "discounts", "returns", "net_sales", "cogs", "gross_profit", "gross_margin", "cost_status", "currency", "ad_spend_allocated_estimate", "profit_after_ads_estimate", "allocation_method"],
        rows.map((r) => [r.productTitle, r.variantTitle, r.sku, r.unitsSold, r.grossSales, r.discounts, r.returns, r.netSales, r.cogs, r.grossProfit, r.grossMargin, r.costStatus, currency, r.allocatedAdSpend, r.profitAfterAds, alloc?.label ?? ""]),
      ),
    );

  return (
    <div>
      <ReportToolbar
        title="Products"
        description="Variant-level gross profit (net sales − COGS). Ad spend can be spread over products with a labelled estimate; fixed costs are not allocated."
        resolved={q.data?.range}
        showCompare={false}
      />
      {current?.isDemo ? <DemoBanner /> : null}
      {missing > 0 ? (
        <Alert tone="warning" title={`${missing} variant${missing === 1 ? "" : "s"} sold in this period have no cost configured`} className="mb-4">
          Their COGS is counted as zero, so gross profit is overstated.{" "}
          {current && !current.isDemo ? (
            <Link href={`/costs/products?store=${encodeURIComponent(current.id)}&missing=1`} className="font-medium underline underline-offset-2">
              Set product costs
            </Link>
          ) : null}
        </Alert>
      ) : null}
      {alloc ? (
        <Alert title={`Ad spend allocated ${alloc.label.toLowerCase()} — an estimate`} className="mb-4">
          {formatMoney(alloc.adSpend, currency)} of ad spend in this range is spread over the variants sold. {alloc.description} Variants with no
          sales (or more returns than sales) carry none.
        </Alert>
      ) : null}
      <Card>
        <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product or SKU" className="pl-8" aria-label="Search products" />
          </div>
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter products">
            <option value="all">All variants</option>
            <option value="loss">Loss-making only</option>
            <option value="missing">Missing cost only</option>
          </NativeSelect>
          <NativeSelect value={allocation} onChange={(e) => setAllocation(e.target.value as typeof allocation)} aria-label="Ad spend allocation">
            <option value="none">Ad spend: not allocated</option>
            <option value="revenue">Ad spend: by share of net sales (estimate)</option>
            <option value="units">Ad spend: by share of units (estimate)</option>
          </NativeSelect>
          <Button variant="outline" className="md:ml-auto" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        </div>
        {!q.data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Boxes} title="No products match">
            No variants were sold in this range or none match your filters.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>SKU</TH>
                {COLUMNS.map((c) => (
                  <TH key={c.key} className="text-right" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => (sort === c.key ? setDir(dir === "asc" ? "desc" : "asc") : (setSort(c.key), setDir("desc")))}
                    >
                      {c.label}
                      {sort === c.key ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                    </button>
                  </TH>
                ))}
                <TH className="text-right">COGS</TH>
                {alloc ? (
                  <>
                    <TH className="text-right">Ad spend (est.)</TH>
                    <TH className="text-right">Profit after ads (est.)</TH>
                  </>
                ) : null}
                <TH>Cost</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.variantId}>
                  <TD className="whitespace-normal">
                    <Link href={`/products/${encodeURIComponent(r.productId)}?${qs}`} className="font-medium hover:underline">
                      {r.productTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">{r.variantTitle}</p>
                  </TD>
                  <TD className="text-muted-foreground">{r.sku}</TD>
                  <TD className="text-right tabular">{formatCount(r.unitsSold)}</TD>
                  <TD className="text-right tabular">{formatMoney(r.netSales, currency)}</TD>
                  <TD className={cn("text-right font-medium tabular", signOf(r.grossProfit) === -1 && "text-negative")}>{formatMoney(r.grossProfit, currency)}</TD>
                  <TD className="text-right tabular">{formatPercent(r.grossMargin)}</TD>
                  <TD className="text-right tabular text-muted-foreground">{formatMoney(r.cogs, currency, { asCost: true })}</TD>
                  {alloc ? (
                    <>
                      <TD className="text-right tabular text-muted-foreground">{formatMoney(r.allocatedAdSpend, currency, { asCost: true })}</TD>
                      <TD className={cn("text-right tabular", signOf(r.profitAfterAds) === -1 && "text-negative")}>{formatMoney(r.profitAfterAds, currency)}</TD>
                    </>
                  ) : null}
                  <TD>
                    <CostStatusBadge status={r.costStatus} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
