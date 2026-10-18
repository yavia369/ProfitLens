"use client";

import type { OrderRow, StoreSummary } from "@profitlens/core";
import type { DateRange } from "@profitlens/finance";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiGet, isEnginePending } from "@/lib/api-client";
import { EnginePending } from "./engine-pending";
import { formatCount, formatDate, formatMoney, formatPercent, signOf } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";
import { OrderDrawer } from "./order-drawer";
import { OrderStatusBadge } from "./status-badge";

type Sort = "processedAt" | "revenue" | "profit" | "margin";
interface OrdersResponse {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  range: DateRange;
  currency: string;
}

function SortHeader({ label, k, sort, dir, onSort, className }: { label: string; k: Sort; sort: Sort; dir: "asc" | "desc"; onSort: (k: Sort) => void; className?: string }) {
  const active = sort === k;
  return (
    <TH className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
        {label}
        {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </TH>
  );
}

export function OrdersView() {
  const [params, , qs] = useReportParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<Sort>("processedAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, sort, dir, qs]);

  const extra = new URLSearchParams({ sort, direction: dir, page: String(page), pageSize: "25" });
  if (debounced) extra.set("search", debounced);
  const q = useQuery({
    queryKey: ["orders", qs, extra.toString()],
    queryFn: () => apiGet<OrdersResponse>(`/api/reports/orders?${qs}&${extra.toString()}`),
    placeholderData: (prev) => prev,
  });
  const store = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = store.data?.stores.find((s) => s.id === params.store);
  const data = q.data;
  const currency = data?.currency ?? current?.currency ?? "USD";
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const onSort = (k: Sort) => {
    if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("desc");
    }
  };

  return (
    <div>
      <ReportToolbar title="Orders" description="Profit per order before advertising. Click an order for its full calculation." resolved={data?.range} showCompare={false} />
      {current?.isDemo ? <DemoBanner /> : null}
      {isEnginePending(q.error) ? <EnginePending message={q.error.message} /> : (
      <Card>
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order #, product or SKU" className="pl-8" aria-label="Search orders" />
          </div>
          <p className="text-sm text-muted-foreground">{data ? `${formatCount(data.total)} orders` : " "}</p>
        </div>
        {!data ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No orders found">
            {debounced ? "Try a different search term." : "There are no orders in the selected date range."}
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <SortHeader label="Date" k="processedAt" sort={sort} dir={dir} onSort={onSort} />
                <TH>Status</TH>
                <TH className="text-right">Items</TH>
                <SortHeader label="Revenue" k="revenue" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                <TH className="text-right">COGS</TH>
                <TH className="text-right">Shipping</TH>
                <TH className="text-right">Fees</TH>
                <SortHeader label="Profit" k="profit" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                <SortHeader label="Margin" k="margin" sort={sort} dir={dir} onSort={onSort} className="text-right" />
              </TR>
            </THead>
            <TBody>
              {data.rows.map((r) => (
                <TR key={r.id} className="cursor-pointer hover:bg-accent/60" onClick={() => setOpenOrder(r.id)}>
                  <TD>
                    <button type="button" className="font-medium text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setOpenOrder(r.id); }}>
                      {r.name}
                    </button>
                    {!r.isComplete ? <span className="ml-2 text-xs text-warning" title="Some costs missing">●</span> : null}
                  </TD>
                  <TD className="text-muted-foreground">{formatDate(r.localDate)}</TD>
                  <TD>
                    <OrderStatusBadge financial={r.financialStatus} />
                  </TD>
                  <TD className="text-right tabular">{r.itemsCount}</TD>
                  <TD className="text-right tabular">{formatMoney(r.revenue, currency)}</TD>
                  <TD className="text-right tabular text-muted-foreground">{formatMoney(r.cogs, currency, { asCost: true })}</TD>
                  <TD className="text-right tabular text-muted-foreground">{formatMoney(r.shippingCost, currency, { asCost: true })}</TD>
                  <TD className="text-right tabular text-muted-foreground">{formatMoney(r.transactionFees, currency, { asCost: true })}</TD>
                  <TD className={cn("text-right font-medium tabular", signOf(r.profit) === -1 && "text-negative")}>{formatMoney(r.profit, currency)}</TD>
                  <TD className="text-right tabular">{formatPercent(r.margin)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {data && data.total > data.pageSize ? (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {data.page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      )}
      <OrderDrawer storeId={params.store} orderId={openOrder} currency={currency} timezone={current?.timezone ?? "UTC"} onClose={() => setOpenOrder(null)} />
    </div>
  );
}
