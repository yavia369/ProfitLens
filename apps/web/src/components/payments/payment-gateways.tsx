"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { connectPaymentGatewayAction, syncPaymentConnectionAction, type ActionState } from "@/app/(app)/settings/actions";
import { FormMessage } from "@/components/costs/form-message";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";

/** Connects a Stripe or PayPal account to one store with read-only credentials. */
export function ConnectPaymentGatewayForm({ stores }: { stores: readonly { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(connectPaymentGatewayAction, null);
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pgStore">Store</Label>
          <NativeSelect id="pgStore" name="storeId" required defaultValue={stores[0]?.id ?? ""}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pgGateway">Processor</Label>
          <NativeSelect id="pgGateway" name="gateway" value={gateway} onChange={(e) => setGateway(e.target.value === "paypal" ? "paypal" : "stripe")}>
            <option value="stripe">Stripe</option>
            <option value="paypal">PayPal</option>
          </NativeSelect>
        </div>
      </div>
      {gateway === "stripe" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="pgSecretKey">Restricted API key</Label>
          <Input id="pgSecretKey" name="secretKey" type="password" required autoComplete="off" spellCheck={false} placeholder="rk_live_…" />
          <p className="text-xs text-muted-foreground">Create a restricted key with Read on Balance and on Charges and PaymentIntents, nothing else. Sent only to the ProfitLens server, stored encrypted and never shown again.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pgClientId">REST app client ID</Label>
            <Input id="pgClientId" name="clientId" required autoComplete="off" spellCheck={false} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pgClientSecret">Client secret</Label>
            <Input id="pgClientSecret" name="clientSecret" type="password" required autoComplete="off" spellCheck={false} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            A live PayPal REST app with Transaction Search enabled. Sent only to the ProfitLens server, stored encrypted and never shown again.
          </p>
        </div>
      )}
      <div>
        <Button type="submit" disabled={pending || stores.length === 0}>
          {pending ? `Checking access and importing the last 90 days…` : `Connect ${gateway === "stripe" ? "Stripe" : "PayPal"}`}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function SyncPaymentConnectionButton({ connectionId }: { connectionId: string }) {
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => setState(await syncPaymentConnectionAction(connectionId)))}>
        <RefreshCw className="size-3.5" aria-hidden />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
