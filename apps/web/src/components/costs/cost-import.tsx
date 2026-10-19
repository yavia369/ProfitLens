"use client";

import type { CostImportPreview } from "@profitlens/core/profit";
import { Upload } from "lucide-react";
import { useState, useTransition } from "react";
import { applyImportAction, previewImportAction, type ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { FormMessage } from "./form-message";

const EXAMPLE = "sku,product_cost,inbound_shipping,effective_from\nLUR-CB-001-[WHITE],12.40,1.10,\nLUR-CB-002-[BROWN],12.40,1.10,2026-10-01";

/** CSV import with a server-validated preview (diff against current costs) before anything is written. */
export function CostImport({ storeId, currency }: { storeId: string; currency: string }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CostImportPreview | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();

  const reset = (text: string) => {
    setCsv(text);
    setPreview(null);
    setResult(null);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" aria-hidden />
          Import CSV
        </Button>
      </SheetTrigger>
      <SheetContent heading="Import product costs" description="Update many costs at once. Nothing changes until you confirm the preview.">
        <div className="flex flex-col gap-4 p-5 text-sm">
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Columns</p>
            <p>
              <code>sku</code> or <code>variant_id</code>, <code>product_cost</code>, and optionally <code>inbound_shipping</code>, <code>handling</code>,{" "}
              <code>effective_from</code> (YYYY-MM-DD; empty = all history). Amounts per unit in {currency}, excluding tax. Tip: export first, fill in the
              cost columns, and import the same file.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cost-file">CSV file</Label>
            <input
              id="cost-file"
              type="file"
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) reset(await f.text());
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cost-csv">…or paste it</Label>
            <textarea
              id="cost-csv"
              value={csv}
              onChange={(e) => reset(e.target.value)}
              rows={6}
              placeholder={EXAMPLE}
              className="rounded-md border border-input bg-card p-2 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!csv.trim() || pending}
              onClick={() =>
                start(async () => {
                  const r = await previewImportAction(storeId, csv);
                  if (r.ok) {
                    setPreview(r.preview);
                    setResult(null);
                  } else setResult({ ok: false, message: r.message });
                })
              }
            >
              Preview
            </Button>
            <Button
              disabled={!preview || preview.matched.length === 0 || pending}
              onClick={() =>
                start(async () => {
                  setResult(await applyImportAction(storeId, csv));
                  setPreview(null);
                })
              }
            >
              {pending && preview ? "Importing and recalculating…" : `Import ${preview?.matched.length ?? 0} cost${preview?.matched.length === 1 ? "" : "s"}`}
            </Button>
          </div>
          <FormMessage state={result} />
          {preview ? (
            <div className="flex flex-col gap-3">
              {preview.errors.length ? (
                <div role="alert" className="rounded-md border border-warning/30 bg-warning-soft p-3 text-xs">
                  <p className="mb-1 font-medium">{preview.errors.length} row(s) will be skipped</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {preview.errors.slice(0, 20).map((e) => (
                      <li key={e.line}>
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.matched.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Item</TH>
                      <TH className="text-right">Current</TH>
                      <TH className="text-right">New landed cost</TH>
                      <TH>From</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {preview.matched.slice(0, 100).map((m) => (
                      <TR key={`${m.line}`}>
                        <TD className="max-w-56 truncate" title={m.label}>
                          {m.label}
                        </TD>
                        <TD className="text-right tabular">{m.previous ? formatMoney(m.previous, currency) : "—"}</TD>
                        <TD className="text-right tabular">{formatMoney(m.landed, currency)}</TD>
                        <TD>{m.effectiveFrom <= "2000-01-01" ? "All history" : m.effectiveFrom}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : null}
              {preview.matched.length > 100 ? <p className="text-xs text-muted-foreground">Showing the first 100 of {preview.matched.length} rows.</p> : null}
              {preview.blank ? <p className="text-xs text-muted-foreground">{preview.blank} row(s) without a product cost will be ignored.</p> : null}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
