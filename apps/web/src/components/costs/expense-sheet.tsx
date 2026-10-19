"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";
import { saveExpenseAction, type ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { plainAmount } from "@/lib/format";
import { EXPENSE_TYPES, type ExpenseType } from "./expense-types";
import { FormMessage } from "./form-message";

export interface ExpenseValues {
  id: string;
  name: string;
  categoryId: string | null;
  type: ExpenseType;
  frequency: "daily" | "weekly" | "monthly" | null;
  allocation: "spread" | "on_date";
  amount: string | null;
  percent: string | null;
  currency: string;
  startDate: string;
  endDate: string | null;
  isAdSpend: boolean;
  note: string | null;
}

export function ExpenseSheet({
  storeId,
  currency,
  categories,
  expense,
  defaultStart,
}: {
  storeId: string;
  currency: string;
  categories: readonly { id: string; name: string; isMarketing: boolean }[];
  expense?: ExpenseValues;
  defaultStart: string;
}) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(saveExpenseAction, null);
  const [type, setType] = useState<ExpenseType>(expense?.type ?? "recurring");
  const [category, setCategory] = useState(expense?.categoryId ?? "");
  const percent = type.startsWith("percent_");
  return (
    <Sheet>
      <SheetTrigger asChild>
        {expense ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Add expense
          </Button>
        )}
      </SheetTrigger>
      <SheetContent heading={expense ? "Edit expense" : "Add expense"} description="Expenses appear in reports immediately; nothing needs recalculating.">
        <form action={action} className="grid gap-4 p-5">
          <input type="hidden" name="storeId" value={storeId} />
          {expense ? <input type="hidden" name="expenseId" value={expense.id} /> : null}
          <div className="grid gap-1.5">
            <Label htmlFor="e-name">Name</Label>
            <Input id="e-name" name="name" required maxLength={120} defaultValue={expense?.name} placeholder="e.g. Shopify plan" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-type">Type</Label>
            <NativeSelect id="e-type" name="type" value={type} onChange={(e) => setType(e.target.value as ExpenseType)}>
              {EXPENSE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">{EXPENSE_TYPES.find((t) => t.value === type)?.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e-amount">{percent ? "Percentage" : "Amount"}</Label>
              <Input id="e-amount" name="amount" inputMode="decimal" required defaultValue={plainAmount(percent ? expense?.percent : expense?.amount)} placeholder={percent ? "e.g. 2.5" : "0.00"} />
            </div>
            {percent ? null : (
              <div className="grid gap-1.5">
                <Label htmlFor="e-currency">Currency</Label>
                <Input id="e-currency" name="currency" required maxLength={3} defaultValue={expense?.currency ?? currency} className="uppercase" />
              </div>
            )}
            {percent ? <input type="hidden" name="currency" value={currency} /> : null}
          </div>
          {type === "recurring" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-freq">Every</Label>
                <NativeSelect id="e-freq" name="frequency" defaultValue={expense?.frequency ?? "monthly"}>
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-alloc">Booking</Label>
                <NativeSelect id="e-alloc" name="allocation" defaultValue={expense?.allocation ?? "spread"}>
                  <option value="spread">Spread evenly over each period</option>
                  <option value="on_date">On each charge date</option>
                </NativeSelect>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e-start">{type === "one_time" ? "Date" : "Starts"}</Label>
              <Input id="e-start" name="startDate" type="date" required defaultValue={expense?.startDate ?? defaultStart} />
            </div>
            {type === "one_time" ? null : (
              <div className="grid gap-1.5">
                <Label htmlFor="e-end">Ends (optional, inclusive)</Label>
                <Input id="e-end" name="endDate" type="date" defaultValue={expense?.endDate ?? ""} />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-cat">Category</Label>
            <NativeSelect id="e-cat" name="categoryId" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isMarketing ? " (marketing)" : ""}
                </option>
              ))}
              <option value="__new">New category…</option>
            </NativeSelect>
          </div>
          {category === "__new" ? (
            <div className="grid gap-2 rounded-md border p-3">
              <Input name="newCategory" required maxLength={60} placeholder="Category name" aria-label="New category name" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="newCategoryMarketing" />
                Marketing category (counted in MER)
              </label>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="isAdSpend" defaultChecked={expense?.isAdSpend} className="mt-1" />
            <span>
              This is advertising spend
              <span className="block text-xs text-muted-foreground">Counted as ad spend (ROAS, contribution after ads) instead of an expense. Don&apos;t also enter it in Advertising.</span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="e-note">Note (optional)</Label>
            <Input id="e-note" name="note" maxLength={500} defaultValue={expense?.note ?? ""} />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save expense"}
            </Button>
          </div>
          <FormMessage state={state} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
