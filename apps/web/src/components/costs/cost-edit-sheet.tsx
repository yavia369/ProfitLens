"use client";

import type { VariantCostRow } from "@profitlens/core/profit";
import { Pencil, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { costHistoryAction, deleteCostVersionAction, setCostAction, type ActionState, type CostVersionView } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { formatDate, formatMoney, plainAmount } from "@/lib/format";
import { FormMessage } from "./form-message";

const SOURCE_LABEL: Record<string, string> = { shopify_sync: "From Shopify", manual: "Manual", csv_import: "CSV import", bulk_edit: "Bulk edit", supplier: "Supplier" };

function period(v: { effectiveFrom: string; effectiveTo: string | null }): string {
  const from = v.effectiveFrom <= "2000-01-01" ? "All history" : `From ${formatDate(v.effectiveFrom, { day: "numeric", month: "short", year: "numeric" })}`;
  return v.effectiveTo ? `${from} until ${formatDate(v.effectiveTo, { day: "numeric", month: "short", year: "numeric" })} (exclusive)` : from;
}

/** Edits a variant's landed cost from a date, shows its cost history, and can apply to all variants of the product. */
export function CostEditSheet({ storeId, currency, row, variantsInProduct, readOnly }: { storeId: string; currency: string; row: VariantCostRow; variantsInProduct: number; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState | null, FormData>(setCostAction, null);
  const [history, setHistory] = useState<CostVersionView[] | null>(null);
  const [from, setFrom] = useState<"all" | "date">(row.current ? "date" : "all");
  const [deleting, startDelete] = useTransition();
  const [deleteState, setDeleteState] = useState<ActionState | null>(null);

  useEffect(() => {
    if (open) void costHistoryAction(storeId, row.variantId).then(setHistory);
  }, [open, storeId, row.variantId, state, deleteState]);

  const label = row.variantTitle ? `${row.productTitle} — ${row.variantTitle}` : row.productTitle;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Edit cost of ${label}`}>
          <Pencil className="size-3.5" aria-hidden />
          {row.current ? "Edit" : "Set cost"}
        </Button>
      </SheetTrigger>
      <SheetContent heading="Product cost" description={label}>
        <div className="flex flex-col gap-6 overflow-y-auto p-5">
          {readOnly ? null : (
            <form action={action} className="grid gap-4">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="variantId" value={row.variantId} />
              <input type="hidden" name="productId" value={row.productId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="productCost">Product cost</Label>
                  <Input id="productCost" name="productCost" inputMode="decimal" required defaultValue={plainAmount(row.current?.productCost)} placeholder="0.00" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="inboundShipping">Inbound shipping</Label>
                  <Input id="inboundShipping" name="inboundShipping" inputMode="decimal" defaultValue={plainAmount(row.current?.inboundShipping)} placeholder="0.00" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="handling">Handling / unit</Label>
                  <Input id="handling" name="handling" inputMode="decimal" defaultValue={plainAmount(row.current?.handling)} placeholder="0.00" />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Per unit, in {currency}, excluding tax. Landed cost = product cost + inbound shipping + handling.
              </p>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Applies to</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="from" value="all" checked={from === "all"} onChange={() => setFrom("all")} />
                  All orders, past and future
                </label>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" name="from" value="date" checked={from === "date"} onChange={() => setFrom("date")} />
                  Orders from
                  <Input type="date" name="effectiveFrom" className="h-8 w-40" disabled={from !== "date"} required={from === "date"} aria-label="Effective from" />
                  <span className="text-xs text-muted-foreground">(earlier orders keep their cost)</span>
                </label>
              </fieldset>
              {variantsInProduct > 1 ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="applyToProduct" />
                  Apply to all {variantsInProduct} variants of this product
                </label>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="note">Note (optional)</Label>
                <Input id="note" name="note" maxLength={500} placeholder="e.g. Supplier invoice #1234" />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving and recalculating…" : "Save cost"}
                </Button>
              </div>
              <FormMessage state={state} />
            </form>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Cost history</h3>
            {history === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cost yet: COGS for this item is counted as 0 and its orders are flagged incomplete.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {history.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tabular">
                        {formatMoney(v.productCost, currency)}
                        {v.inboundShipping !== "0.000000" ? ` + ${formatMoney(v.inboundShipping, currency)} inbound` : ""}
                        {v.handling !== "0.000000" ? ` + ${formatMoney(v.handling, currency)} handling` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {period(v)} · {SOURCE_LABEL[v.source] ?? v.source}
                        {v.note ? ` · ${v.note}` : ""}
                      </p>
                    </div>
                    {readOnly ? null : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete this cost version"
                        disabled={deleting}
                        onClick={() => startDelete(async () => setDeleteState(await deleteCostVersionAction(storeId, v.id)))}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <FormMessage state={deleteState} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
