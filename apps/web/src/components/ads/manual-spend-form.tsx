"use client";

import { useActionState, useState } from "react";
import { saveManualSpendAction, type ActionState } from "@/app/(app)/costs/actions";
import { FormMessage } from "@/components/costs/form-message";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { PLATFORM_LABEL } from "./platforms";

/** Manual ad spend for one day, or a total spread evenly over a date range (e.g. a monthly invoice). */
export function ManualSpendForm({ storeId, currency, today }: { storeId: string; currency: string; today: string }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(saveManualSpendAction, null);
  const [spread, setSpread] = useState<"day" | "range">("day");
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_7rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="ms-platform">Channel</Label>
          <NativeSelect id="ms-platform" name="platform" defaultValue="meta">
            {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ms-amount">Amount</Label>
          <Input id="ms-amount" name="amount" inputMode="decimal" required placeholder="0.00" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ms-currency">Currency</Label>
          <Input id="ms-currency" name="currency" required maxLength={3} defaultValue={currency} className="uppercase" />
        </div>
      </div>
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="sr-only">Dates</legend>
        <NativeSelect name="spread" aria-label="Single day or date range" value={spread} onChange={(e) => setSpread(e.target.value as "day" | "range")}>
          <option value="day">On one day</option>
          <option value="range">Spread evenly over</option>
        </NativeSelect>
        <Input type="date" name="from" required defaultValue={today} className="w-44" aria-label={spread === "day" ? "Date" : "From"} />
        {spread === "range" ? (
          <>
            <span className="pb-2 text-sm text-muted-foreground">to</span>
            <Input type="date" name="to" required className="w-44" aria-label="To (inclusive)" />
          </>
        ) : null}
      </fieldset>
      <div className="grid gap-1.5">
        <Label htmlFor="ms-note">Note (optional)</Label>
        <Input id="ms-note" name="note" maxLength={300} placeholder="e.g. Meta invoice 2026-10" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="adjustment" className="mt-1" />
        <span>
          Adjustment
          <span className="block text-xs text-muted-foreground">Only to correct spend that is already imported from the platform&apos;s API (it is added on top).</span>
        </span>
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add spend"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
