"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { saveHandlingRuleAction, saveShippingRuleAction, type ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { plainAmount } from "@/lib/format";
import { FormMessage } from "./form-message";

export interface ShippingRuleValues {
  id: string;
  name: string;
  type: "per_order" | "per_item" | "first_plus_additional" | "tiered_quantity";
  params: Record<string, unknown>;
  countryCodes: string[] | null;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const TYPES = [
  { value: "per_order", label: "Flat amount per order" },
  { value: "per_item", label: "Amount per item" },
  { value: "first_plus_additional", label: "First item + each additional item" },
  { value: "tiered_quantity", label: "Total by number of items (tiers)" },
] as const;

const trim = (v: unknown) => (typeof v === "string" ? plainAmount(v) : "");

/** Create or edit a shipping-cost rule (what the store pays the carrier, not what the customer pays). */
export function ShippingRuleSheet({ storeId, currency, rule, defaultFrom }: { storeId: string; currency: string; rule?: ShippingRuleValues; defaultFrom: string }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(saveShippingRuleAction, null);
  const [type, setType] = useState<ShippingRuleValues["type"]>(rule?.type ?? "per_order");
  const initialTiers = Array.isArray(rule?.params.tiers) ? (rule.params.tiers as { minQuantity: number; amount: string }[]) : [];
  const [tiers, setTiers] = useState(initialTiers.length ? initialTiers.map((t) => ({ min: String(t.minQuantity), amount: trim(t.amount) })) : [{ min: "1", amount: "" }, { min: "", amount: "" }]);
  return (
    <Sheet>
      <SheetTrigger asChild>
        {rule ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Add shipping rule
          </Button>
        )}
      </SheetTrigger>
      <SheetContent heading={rule ? "Edit shipping rule" : "Add shipping rule"} description={`Amounts in ${currency}, excluding tax. Applies to orders by order date.`}>
        <form action={action} className="grid gap-4 p-5">
          <input type="hidden" name="storeId" value={storeId} />
          {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={100} defaultValue={rule?.name} placeholder="e.g. Australia Post — domestic" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="type">How the cost is calculated</Label>
            <NativeSelect id="type" name="type" value={type} onChange={(e) => setType(e.target.value as ShippingRuleValues["type"])}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {type === "per_order" || type === "per_item" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="amount">{type === "per_order" ? "Cost per order" : "Cost per item"}</Label>
              <Input id="amount" name="amount" inputMode="decimal" required defaultValue={trim(rule?.params.amount)} placeholder="0.00" />
            </div>
          ) : type === "first_plus_additional" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="first">First item</Label>
                <Input id="first" name="first" inputMode="decimal" required defaultValue={trim(rule?.params.first)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="additional">Each additional item</Label>
                <Input id="additional" name="additional" inputMode="decimal" required defaultValue={trim(rule?.params.additional)} />
              </div>
            </div>
          ) : (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Tiers (total shipping cost from N items)</legend>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <Input name="tierMin" inputMode="numeric" aria-label={`Tier ${i + 1}: from items`} placeholder="From items" value={t.min} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                  <Input name="tierAmount" inputMode="decimal" aria-label={`Tier ${i + 1}: total cost`} placeholder="Total cost" value={t.amount} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                </div>
              ))}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { min: "", amount: "" }])} disabled={tiers.length >= 20}>
                  Add tier
                </Button>
              </div>
            </fieldset>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="countries">Destination countries</Label>
            <Input id="countries" name="countries" defaultValue={rule?.countryCodes?.join(", ") ?? ""} placeholder="All countries (or e.g. AU, NZ)" />
            <p className="text-xs text-muted-foreground">2-letter codes. When several rules match an order, the lowest priority number wins.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Input id="priority" name="priority" inputMode="numeric" defaultValue={rule?.priority ?? 100} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="effectiveFrom">From</Label>
              <Input id="effectiveFrom" name="effectiveFrom" type="date" required defaultValue={rule?.effectiveFrom ?? defaultFrom} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="effectiveTo">Until (exclusive)</Label>
              <Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={rule?.effectiveTo ?? ""} />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving and recalculating…" : "Save rule"}
            </Button>
          </div>
          <FormMessage state={state} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function HandlingRuleForm({ storeId, currency, defaultFrom }: { storeId: string; currency: string; defaultFrom: string }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(saveHandlingRuleAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_8rem_10rem_10rem_auto] sm:items-end">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-1.5">
        <Label htmlFor="h-mode">Handling</Label>
        <NativeSelect id="h-mode" name="mode" defaultValue="per_order">
          <option value="per_order">Per order</option>
          <option value="per_item">Per item</option>
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="h-amount">Amount ({currency})</Label>
        <Input id="h-amount" name="amount" inputMode="decimal" required placeholder="0.00" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="h-from">From</Label>
        <Input id="h-from" name="effectiveFrom" type="date" required defaultValue={defaultFrom} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="h-to">Until (exclusive)</Label>
        <Input id="h-to" name="effectiveTo" type="date" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Add"}
      </Button>
      <div className="sm:col-span-5">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
