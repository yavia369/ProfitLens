"use server";

import { enqueueBackfill, enqueueIncremental, QUEUES } from "@profitlens/core/jobs";
import { connectStoreWithClientCredentials, ConnectionError } from "@profitlens/core/shopify";
import { assertRole, assertStoresInScope, TenantAccessError } from "@profitlens/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";
import { jobs, shopifyDeps } from "@/server/shopify";

export interface ActionState {
  ok: boolean;
  message: string;
}

const connectSchema = z.object({
  shopDomain: z.string().trim().min(3).max(255),
  clientId: z.string().trim().min(8).max(200),
  clientSecret: z.string().trim().min(8).max(500),
});

export async function connectStoreAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const session = await requireAppSession();
  const parsed = connectSchema.safeParse({ shopDomain: form.get("shopDomain"), clientId: form.get("clientId"), clientSecret: form.get("clientSecret") });
  if (!parsed.success) return { ok: false, message: "Fill in the store domain, Client ID and Client secret." };
  try {
    const result = await connectStoreWithClientCredentials(shopifyDeps(), session.scope, parsed.data);
    await enqueueBackfill(jobs(), result.storeId);
    revalidatePath("/settings/stores");
    revalidatePath("/settings/sync");
    return {
      ok: true,
      message: `Connected ${result.shopName}. Historical import has started${result.historyLimited ? " (last 60 days only until read_all_orders is granted)" : ""} — follow it in the Sync Center.`,
    };
  } catch (e) {
    if (e instanceof ConnectionError || e instanceof TenantAccessError) return { ok: false, message: e.message };
    console.error("connectStoreAction", e);
    return { ok: false, message: "Unexpected error while connecting. Please try again." };
  }
}

async function authorizedStore(storeId: string) {
  const session = await requireAppSession();
  assertRole(session.scope, "editor");
  await assertStoresInScope(db(), session.scope, [storeId]);
  return session;
}

export async function syncNowAction(storeId: string): Promise<ActionState> {
  await authorizedStore(storeId);
  await enqueueIncremental(jobs(), storeId);
  revalidatePath("/settings/sync");
  return { ok: true, message: "Sync queued." };
}

export async function reimportAction(storeId: string): Promise<ActionState> {
  await authorizedStore(storeId);
  await enqueueBackfill(jobs(), storeId);
  revalidatePath("/settings/sync");
  return { ok: true, message: "Full re-import queued (safe to repeat: imports never duplicate data)." };
}

export async function reconcileAction(storeId: string): Promise<ActionState> {
  await authorizedStore(storeId);
  await jobs().send(QUEUES.reconcile, { storeId }, { singletonKey: storeId });
  revalidatePath("/settings/sync");
  return { ok: true, message: "Reconciliation queued." };
}
