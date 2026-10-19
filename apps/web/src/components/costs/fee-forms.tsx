"use client";

import { useActionState } from "react";
import { saveGatewayRuleAction, setThirdPartyFeeAction, type ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { plainAmount } from "@/lib/format";
import { FormMessage } from "./form-message";

export function GatewayRuleForm({ storeId, currency, gateways }: { storeId: string; currency: string; gateways: readonly string[] }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(saveGatewayRuleAction, null);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_7rem_7rem_9.5rem_9.5rem] md:items-end">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-1.5">
        <Label htmlFor="g-gateway">Payment gateway</Label>
        <Input id="g-gateway" name="gateway" required list="known-gateways" placeholder="e.g. paypal" maxLength={100} />
        <datalist id="known-gateways">
          {gateways.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-rate">Rate %</Label>
        <Input id="g-rate" name="percentRate" inputMode="decimal" required placeholder="2.6" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-fixed">Fixed ({currency})</Label>
        <Input id="g-fixed" name="fixedFee" inputMode="decimal" placeholder="0.30" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-from">From</Label>
        <Input id="g-from" name="effectiveFrom" type="date" required defaultValue="2000-01-01" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-to">Until (exclusive)</Label>
        <Input id="g-to" name="effectiveTo" type="date" />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-4">
        <input type="checkbox" name="thirdPartyFeeApplies" defaultChecked />
        Shopify also charges its third-party transaction fee on this gateway
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add rule"}
      </Button>
      <div className="md:col-span-5">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ThirdPartyFeeForm({ storeId, rate, plan }: { storeId: string; rate: string | null; plan: string | null }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(setThirdPartyFeeAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="tp-rate">Shopify third-party fee %</Label>
          <Input id="tp-rate" name="rate" inputMode="decimal" className="w-32" defaultValue={plainAmount(rate)} placeholder="unknown" />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Charged by Shopify on payments through gateways other than Shopify Payments{plan ? ` (plan: ${plan})` : ""}. Leave empty if unknown.
      </p>
      <FormMessage state={state} />
    </form>
  );
}
