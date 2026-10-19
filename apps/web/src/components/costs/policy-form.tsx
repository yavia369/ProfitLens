"use client";

import { POLICY_DESCRIPTIONS, type FinancialPolicy } from "@profitlens/finance";
import { useActionState, useState, type ReactNode } from "react";
import { savePolicyAction, type ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { plainAmount } from "@/lib/format";
import { FormMessage } from "./form-message";

const STATUSES = ["PENDING", "AUTHORIZED", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED", "EXPIRED"] as const;
const RESTOCK = ["RETURN", "CANCEL", "NO_RESTOCK", "LEGACY_RESTOCK"] as const;
const human = (s: string) => s.toLowerCase().replace(/_/g, " ");

function Row({ k, children }: { k: keyof FinancialPolicy; children: ReactNode }) {
  return (
    <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
      <div className="font-medium">{POLICY_DESCRIPTIONS[k].label}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Toggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

/** Editable calculation policy. Saving creates a new version and recalculates the store. */
export function PolicyForm({ storeId, policy }: { storeId: string; policy: FinancialPolicy }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(savePolicyAction, null);
  const [fallback, setFallback] = useState(policy.cogsFallback.mode);
  return (
    <form action={action}>
      <input type="hidden" name="storeId" value={storeId} />
      <div className="divide-y rounded-lg border">
        <Row k="includedFinancialStatuses">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {STATUSES.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" name="includedFinancialStatuses" value={s} defaultChecked={policy.includedFinancialStatuses.includes(s)} />
                {human(s)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Test orders are always excluded.</p>
        </Row>
        <Row k="tipsAsRevenue">
          <Toggle name="tipsAsRevenue" defaultChecked={policy.tipsAsRevenue} label="Count tips as revenue" />
        </Row>
        <Row k="dutiesAndFeesAsRevenue">
          <Toggle name="dutiesAndFeesAsRevenue" defaultChecked={policy.dutiesAndFeesAsRevenue} label="Count duties and checkout fees as revenue (otherwise pass-through)" />
        </Row>
        <Row k="refundDating">
          <NativeSelect name="refundDating" defaultValue={policy.refundDating} className="max-w-md">
            <option value="event">On the day of the refund (matches Shopify reports)</option>
            <option value="order">Restated onto the original order date</option>
          </NativeSelect>
        </Row>
        <Row k="chargebackDating">
          <NativeSelect name="chargebackDating" defaultValue={policy.chargebackDating} className="max-w-md">
            <option value="event">On the dispute resolution date</option>
            <option value="order">Restated onto the original order date</option>
          </NativeSelect>
        </Row>
        <Row k="cogsFallback">
          <NativeSelect name="cogsFallbackMode" value={fallback} onChange={(e) => setFallback(e.target.value as typeof fallback)} className="max-w-md">
            <option value="none">Count as zero and flag as missing</option>
            <option value="percent_of_price">Estimate as a percentage of the selling price</option>
          </NativeSelect>
          {fallback === "percent_of_price" ? (
            <label className="flex items-center gap-2">
              <Input
                name="cogsFallbackPercent"
                inputMode="decimal"
                required
                className="w-24"
                defaultValue={policy.cogsFallback.mode === "percent_of_price" ? plainAmount(policy.cogsFallback.percent) : "35"}
                aria-label="Estimated cost as percent of price"
              />
              % of price (shown as “estimated”)
            </label>
          ) : null}
        </Row>
        <Row k="cogsReversalRestockTypes">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {RESTOCK.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" name="cogsReversalRestockTypes" value={s} defaultChecked={policy.cogsReversalRestockTypes.includes(s)} />
                {human(s)}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Returned items of these restock types give their cost back. Legacy restock follows Shopify&apos;s “restocked” flag.</p>
        </Row>
        <Row k="zeroShippingIfUnfulfilledCancel">
          <Toggle name="zeroShippingIfUnfulfilledCancel" defaultChecked={policy.zeroShippingIfUnfulfilledCancel} label="No shipping cost for orders cancelled before fulfilment" />
        </Row>
        <Row k="feeTaxRecoverable">
          <Toggle name="feeTaxRecoverable" defaultChecked={policy.feeTaxRecoverable} label="Tax on payment fees is recoverable (e.g. registered for GST) — exclude it from fees" />
        </Row>
        <Row k="feesRefundedOnRefund">
          <Toggle name="feesRefundedOnRefund" defaultChecked={policy.feesRefundedOnRefund} label="Payment processors return fees pro rata on refunds" />
        </Row>
        <Row k="defaultChargebackFee">
          <Input name="defaultChargebackFee" inputMode="decimal" className="w-32" defaultValue={plainAmount(policy.defaultChargebackFee)} placeholder="none" aria-label="Default chargeback fee" />
          <p className="text-xs text-muted-foreground">Used when a lost chargeback has no fee data. Empty = flagged as missing.</p>
        </Row>
        <Row k="expenseAllocation">
          <NativeSelect name="expenseAllocation" defaultValue={policy.expenseAllocation} className="max-w-md">
            <option value="spread">Spread recurring expenses over their period</option>
            <option value="on_date">Book recurring expenses on their dates</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Default for new expenses; each expense can override it.</p>
        </Row>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving and recalculating…" : "Save as new version"}
        </Button>
        <p className="text-xs text-muted-foreground">Every order is recalculated with the new version; earlier versions are kept for traceability.</p>
      </div>
      <div className="mt-2">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
