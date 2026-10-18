"use client";

import { useActionState } from "react";
import { connectStoreAction, type ActionState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ConnectStoreForm() {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(connectStoreAction, null);
  return (
    <form action={formAction} className="grid max-w-md gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="shopDomain">Store domain</Label>
        <Input id="shopDomain" name="shopDomain" placeholder="your-store.myshopify.com" required autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="clientId">Client ID</Label>
        <Input id="clientId" name="clientId" required autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input id="clientSecret" name="clientSecret" type="password" required autoComplete="new-password" />
      </div>
      <p className="text-xs text-muted-foreground">The secret is sent only to the ProfitLens server and stored encrypted (AES-256-GCM). Access is read-only.</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Verifying with Shopify…" : "Connect store"}
        </Button>
      </div>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? "text-positive" : "text-negative")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
