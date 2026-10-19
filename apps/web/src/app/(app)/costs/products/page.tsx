import { listVariantCosts } from "@profitlens/core/profit";
import { Download, PackageSearch, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { CostEditSheet } from "@/components/costs/cost-edit-sheet";
import { CostImport } from "@/components/costs/cost-import";
import { CostPage } from "@/components/costs/cost-page";
import { CostStatusBadge } from "@/components/reports/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { canEdit, costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Product costs" };

const PAGE_SIZE = 50;
const SOURCE: Record<string, "actual" | "manual"> = { shopify_sync: "actual" };

export default async function ProductCostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const search = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const missingOnly = sp.missing === "1";
  const page = Math.max(Number(typeof sp.page === "string" ? sp.page : "1") || 1, 1);
  const data = store ? await listVariantCosts(db(), session.scope, store.id, { search, missingOnly, page, pageSize: PAGE_SIZE }) : null;
  const productVariantCounts = new Map<string, number>();
  if (data) for (const r of data.rows) productVariantCounts.set(r.productId, (productVariantCounts.get(r.productId) ?? 0) + 1);
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    if (store) q.set("store", store.id);
    if (search) q.set("q", search);
    if (missingOnly) q.set("missing", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    return `/costs/products?${q.toString()}` as Route;
  };
  const pages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <CostPage
      title="Product costs"
      description="Landed cost per unit, effective-dated: past orders keep the cost that applied when they were sold."
      store={store}
      requestedDemo={requestedDemo}
      readOnly={!canEdit(session)}
    >
      {(s) => (
        <>
          {data && data.missingSold > 0 ? (
            <Alert tone="warning" title={`${formatCount(data.missingSold)} sold item${data.missingSold === 1 ? " has" : "s have"} no cost`}>
              Their COGS is counted as 0 and those orders are marked incomplete, so profit is overstated. Items are listed by units ordered: start at the top,
              or import a CSV for many at once.
            </Alert>
          ) : null}
          <Card>
            <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center">
              <form className="relative w-full lg:max-w-xs" action="/costs/products">
                <input type="hidden" name="store" value={s.id} />
                {missingOnly ? <input type="hidden" name="missing" value="1" /> : null}
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input name="q" defaultValue={search} placeholder="Search product, variant or SKU" className="pl-8" aria-label="Search items" />
              </form>
              <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                <Button asChild variant={missingOnly ? "secondary" : "outline"} size="sm">
                  <Link href={href({ missing: missingOnly ? null : "1", page: null })}>
                    {missingOnly ? "Showing missing only" : `Missing only (${formatCount(data?.missingTotal ?? 0)})`}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/costs/export?store=${encodeURIComponent(s.id)}`}>
                    <Download className="size-4" aria-hidden />
                    Export CSV
                  </a>
                </Button>
                {canEdit(session) ? <CostImport storeId={s.id} currency={s.currency} /> : null}
              </div>
            </div>
            {data && data.rows.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Item</TH>
                    <TH>SKU</TH>
                    <TH className="text-right">Price</TH>
                    <TH className="text-right">Units ordered</TH>
                    <TH className="text-right">Landed cost</TH>
                    <TH>Since</TH>
                    <TH>Status</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {data.rows.map((r) => (
                    <TR key={r.variantId}>
                      <TD className="max-w-72">
                        <p className="truncate font-medium" title={r.productTitle}>
                          {r.productTitle}
                        </p>
                        {r.variantTitle ? <p className="truncate text-xs text-muted-foreground">{r.variantTitle}</p> : null}
                      </TD>
                      <TD className="max-w-40 truncate text-xs text-muted-foreground" title={r.sku}>
                        {r.sku || "—"}
                      </TD>
                      <TD className="text-right tabular">{formatMoney(r.price, s.currency)}</TD>
                      <TD className="text-right tabular">{formatCount(r.unitsOrdered)}</TD>
                      <TD className="text-right tabular">{r.current ? formatMoney(r.current.landed, s.currency) : "—"}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {r.current ? (r.current.effectiveFrom <= "2000-01-01" ? "All history" : formatDate(r.current.effectiveFrom, { day: "numeric", month: "short", year: "numeric" })) : ""}
                      </TD>
                      <TD>
                        <CostStatusBadge status={r.current ? (SOURCE[r.current.source] ?? "manual") : "missing"} />
                      </TD>
                      <TD className="text-right">
                        <CostEditSheet storeId={s.id} currency={s.currency} row={r} variantsInProduct={productVariantCounts.get(r.productId) ?? 1} readOnly={!canEdit(session)} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={PackageSearch} title={missingOnly ? "Every item has a cost" : "No items found"}>
                {search ? "Try a different search." : missingOnly ? "COGS is complete for this store." : "Products appear here after the first Shopify import."}
              </EmptyState>
            )}
            {data && pages > 1 ? (
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                <span>
                  Page {page} of {pages} · {formatCount(data.total)} items
                </span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                    {page > 1 ? <Link href={href({ page: String(page - 1) })}>Previous</Link> : <span aria-disabled>Previous</span>}
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    {page < pages ? <Link href={href({ page: String(page + 1) })}>Next</Link> : <span aria-disabled>Next</span>}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </CostPage>
  );
}
