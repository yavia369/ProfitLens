"use client";

import type { PnlReport, PnlRow, StoreSummary } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Download } from "lucide-react";
import { Fragment, useState } from "react";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";
import { StoreComparison } from "./store-comparison";

function columnLabel(start: string, end: string, granularity: PnlReport["granularity"]): string {
  if (granularity === "month") return formatDate(start, { month: "short", year: "numeric" });
  if (granularity === "week") return `${formatDate(start)}–${formatDate(end)}`;
  return formatDate(start, { weekday: "short", day: "numeric", month: "short" });
}

function Cell({ row, value, currency }: { row: PnlRow; value: string | null; currency: string }) {
  if (row.kind === "ratio") return <>{formatPercent(value)}</>;
  return <>{formatMoney(value, currency, { asCost: row.kind === "cost" })}</>;
}

export function PnlView() {
  const [params, update, qs] = useReportParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: ["pnl", qs], queryFn: () => apiGet<PnlReport>(`/api/reports/pnl?${qs}`), placeholderData: (prev) => prev });
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = stores.data?.stores.find((s) => s.id === params.store);
  const liveStores = (stores.data?.stores ?? []).filter((s) => !s.isDemo);
  const canCompare = liveStores.length >= 2 && !current?.isDemo;
  const [view, setView] = useState<"period" | "stores">("period");
  const [consolidateIn, setConsolidateIn] = useState<string | null>(null);
  const liveCurrencies = [...new Set(liveStores.slice(0, 10).map((s) => s.currency))].sort();
  const byStore = canCompare && view === "stores";
  const range = new URLSearchParams(qs);
  range.delete("store");
  const storesQuery = `stores=${liveStores.slice(0, 10).map((s) => s.id).join(",")}&${range.toString()}`;
  const storesExportQuery = consolidateIn ? `${storesQuery}&currency=${consolidateIn}` : storesQuery;
  const exportHref = (format: "xlsx" | "pdf") => `/api/reports/pnl/export?format=${format}&${byStore ? `view=stores&${storesExportQuery}` : qs}`;
  const r = q.data;
  const currency = r?.store.currency ?? "USD";

  const exportCsv = () => {
    if (!r) return;
    const flat: PnlRow[] = r.rows.flatMap((row) => [row, ...row.children]);
    downloadCsv(
      `pnl_${r.range.start}_${r.range.end}_${r.granularity}.csv`,
      toCsv(
        ["line", "kind", ...r.columns.map((c) => c.key), "total", "currency", "basis"],
        flat.map((row) => [row.label, row.kind, ...row.values, row.total, row.kind === "ratio" ? "ratio" : currency, "management estimate"]),
      ),
    );
  };

  return (
    <div>
      <ReportToolbar title="Profit & loss" description="Operational P&L built from the same ledger as the dashboard." resolved={r?.range} showCompare={false}>
        {canCompare ? (
          <NativeSelect aria-label="View" value={view} onChange={(e) => setView(e.target.value as "period" | "stores")}>
            <option value="period">By period</option>
            <option value="stores">By store</option>
          </NativeSelect>
        ) : null}
        {byStore ? null : (
        <NativeSelect
          aria-label="Columns"
          value={params.granularity ?? r?.granularity ?? "month"}
          onChange={(e) => update({ granularity: e.target.value as "day" | "week" | "month" })}
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </NativeSelect>
        )}
        {byStore ? null : (
          <Button variant="outline" onClick={exportCsv} disabled={!r}>
            <Download /> CSV
          </Button>
        )}
        <Button asChild variant="outline">
          <a href={exportHref("xlsx")}>
            <Download /> Excel
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={exportHref("pdf")}>
            <Download /> PDF
          </a>
        </Button>
      </ReportToolbar>
      {current?.isDemo ? <DemoBanner /> : null}
      <Alert title="Management report — not an accounting statement" className="mb-4">
        Revenue is event-dated (refunds on the day they happen), taxes and gift-card sales are excluded from revenue, and costs follow this
        store&apos;s calculation policy. Use it for operating decisions; your accountant&apos;s books remain the source of record.
      </Alert>
      {byStore ? <StoreComparison query={storesQuery} currencies={liveCurrencies} currency={consolidateIn} onCurrency={setConsolidateIn} /> : (
      <Card className="overflow-hidden">
        {!r ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : r.columns.length > 62 ? (
          <p className="p-6 text-sm text-muted-foreground">Too many columns for a daily view of this range — choose weekly or monthly.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="sticky left-0 z-10 min-w-56 bg-muted px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Line</th>
                  {r.columns.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                      {columnLabel(c.start, c.end, r.granularity)}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-l px-4 py-2.5 text-right text-xs font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => {
                  const isOpen = expanded.has(row.key);
                  const canExpand = row.children.length > 0;
                  const strong = row.kind === "subtotal";
                  return (
                    <Fragment key={row.key}>
                      <tr className={cn("border-b", strong && "bg-muted/40 font-semibold", row.kind === "memo" && "text-muted-foreground", row.key === "taxes" && "border-t-2")}>
                        <td className={cn("sticky left-0 z-10 px-4 py-2", strong ? "bg-muted" : "bg-card")}>
                          {canExpand ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              aria-expanded={isOpen}
                              onClick={() => {
                                const next = new Set(expanded);
                                if (isOpen) next.delete(row.key);
                                else next.add(row.key);
                                setExpanded(next);
                              }}
                            >
                              <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} aria-hidden />
                              {row.label}
                            </button>
                          ) : (
                            <span className={cn(!strong && row.kind !== "memo" && "pl-[18px]")}>{row.label}</span>
                          )}
                        </td>
                        {row.values.map((v, i) => (
                          <td key={r.columns[i]!.key} className="whitespace-nowrap px-3 py-2 text-right tabular">
                            <Cell row={row} value={v} currency={currency} />
                          </td>
                        ))}
                        <td className="whitespace-nowrap border-l px-4 py-2 text-right font-medium tabular">
                          <Cell row={row} value={row.total} currency={currency} />
                        </td>
                      </tr>
                      {isOpen
                        ? row.children.map((child) => (
                            <tr key={child.key} className="border-b text-muted-foreground">
                              <td className="sticky left-0 z-10 bg-card py-2 pl-10 pr-4">{child.label}</td>
                              {child.values.map((v, i) => (
                                <td key={r.columns[i]!.key} className="whitespace-nowrap px-3 py-2 text-right tabular">
                                  <Cell row={child} value={v} currency={currency} />
                                </td>
                              ))}
                              <td className="whitespace-nowrap border-l px-4 py-2 text-right tabular">
                                <Cell row={child} value={child.total} currency={currency} />
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
    </div>
  );
}
