"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { connectGoogleAdsAction, mapAdAccountAction, syncAdAccountAction, type ActionState } from "@/app/(app)/settings/actions";
import { FormMessage } from "@/components/costs/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { TD, TR } from "@/components/ui/table";

export function ConnectGoogleAdsForm({ reconnect }: { reconnect: boolean }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(connectGoogleAdsAction, null);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="keyJson">Service account key (JSON)</Label>
        <textarea
          id="keyJson"
          name="keyJson"
          required
          rows={4}
          autoComplete="off"
          spellCheck={false}
          placeholder='{"type": "service_account", ...}'
          className="rounded-md border border-input bg-card p-2 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">Sent only to the ProfitLens server, stored encrypted and never shown again. Read-only access is enough.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="loginCustomerId">Manager account ID (optional)</Label>
        <Input id="loginCustomerId" name="loginCustomerId" placeholder="123-456-7890" className="max-w-48" autoComplete="off" />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking access with Google…" : reconnect ? "Update key" : "Connect Google Ads"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export interface AdAccountView {
  id: string;
  customerId: string;
  name: string;
  currency: string;
  timezone: string;
  isManager: boolean;
  accountStatus: string | null;
  storeId: string | null;
  syncEnabled: boolean;
  spendSyncedThrough: string | null;
  lastError: string | null;
}

const formatCustomerId = (id: string) => (/^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id);

/** One ad account: which store its spend belongs to, whether it syncs, and its sync state. */
export function AdAccountRow({ account, stores, editable }: { account: AdAccountView; stores: readonly { id: string; name: string; timezone: string; currency: string }[]; editable: boolean }) {
  const [storeId, setStoreId] = useState(account.storeId ?? "");
  const [sync, setSync] = useState(account.syncEnabled);
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const store = stores.find((s) => s.id === storeId);
  const save = (nextStore: string, nextSync: boolean) =>
    start(async () => {
      setState(await mapAdAccountAction(account.id, nextStore || null, nextSync && nextStore !== ""));
    });
  const closed = account.accountStatus !== null && account.accountStatus !== "ENABLED";
  return (
    <TR>
      <TD>
        <p className="font-medium">{account.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatCustomerId(account.customerId)} · {account.currency} · {account.timezone}
        </p>
        {store && store.timezone !== account.timezone ? (
          <p className="text-xs text-warning">Time zone differs from the store&apos;s: days are mapped date to date.</p>
        ) : null}
        {store && store.currency !== account.currency ? <p className="text-xs text-warning">Spend in {account.currency} needs exchange rates to {store.currency} (not available yet).</p> : null}
      </TD>
      <TD>
        {account.isManager ? (
          <Badge variant="neutral">manager — map the accounts below it</Badge>
        ) : closed ? (
          <Badge variant="neutral">{account.accountStatus!.toLowerCase()}</Badge>
        ) : (
          <NativeSelect
            aria-label={`Store for ${account.name}`}
            value={storeId}
            disabled={!editable || pending}
            onChange={(e) => {
              setStoreId(e.target.value);
              const nextSync = e.target.value !== "";
              setSync(nextSync);
              save(e.target.value, nextSync);
            }}
          >
            <option value="">Not used</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </TD>
      <TD>
        {account.isManager || closed ? null : (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sync}
              disabled={!editable || pending || storeId === ""}
              onChange={(e) => {
                setSync(e.target.checked);
                save(storeId, e.target.checked);
              }}
            />
            Sync
          </label>
        )}
      </TD>
      <TD className="text-xs text-muted-foreground">
        {account.lastError ? <span className="text-negative">{account.lastError}</span> : account.spendSyncedThrough ? `Through ${account.spendSyncedThrough}` : account.syncEnabled ? "Not imported yet" : ""}
        <FormMessage state={pending ? { ok: true, message: storeId && sync && !account.spendSyncedThrough ? "Importing spend history…" : "Saving…" } : state} />
      </TD>
      <TD className="text-right">
        {editable && account.syncEnabled && !account.isManager ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => setState(await syncAdAccountAction(account.id)))}>
            <RefreshCw className="size-3.5" aria-hidden />
            Sync now
          </Button>
        ) : null}
      </TD>
    </TR>
  );
}
