"use server";

import { AdsSyncService, connectGoogleAdsServiceAccount, connectMetaSystemUser, GoogleAdsError, mapAdAccount, MetaAdsError } from "@profitlens/core/ads";
import { enqueueBackfill, enqueueIncremental, QUEUES } from "@profitlens/core/jobs";
import { connectPaymentGateway, GatewayApiError, syncPaymentGateway, type GatewaySyncResult } from "@profitlens/core/payments";
import { connectStoreWithClientCredentials, ConnectionError } from "@profitlens/core/shopify";
import { assertRole, assertStoresInScope, schema, TenantAccessError } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";
import { adsDeps, jobs, shopifyDeps } from "@/server/shopify";

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

// ---------------------------------------------------------------- Ad platforms (Google Ads, Meta)

function adsError(e: unknown): ActionState {
  if (e instanceof GoogleAdsError || e instanceof MetaAdsError || e instanceof TenantAccessError) return { ok: false, message: e.message };
  console.error("ads action", e);
  return { ok: false, message: "Unexpected error talking to the ad platform. Nothing was changed." };
}

/** Imports spend for one account now (seconds, even for the 3-year history) so the user sees the result. */
async function syncNow(accountId: string, full = false): Promise<string> {
  const r = await new AdsSyncService(adsDeps()).syncAccount(accountId, { full });
  return `Imported ${r.stats.rows} campaign-day rows (${r.from} to ${r.to}).`;
}

export async function connectGoogleAdsAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const session = await requireAppSession();
  const keyJson = String(form.get("keyJson") ?? "").trim();
  if (!keyJson) return { ok: false, message: "Paste the service account key (JSON)." };
  try {
    const r = await connectGoogleAdsServiceAccount(adsDeps(), session.scope, { keyJson, loginCustomerId: String(form.get("loginCustomerId") ?? "") || null });
    revalidatePath("/settings/stores");
    const n = r.accounts.filter((a) => !a.isManager).length;
    return { ok: true, message: `Connected as ${r.serviceAccountEmail}. Found ${n} ad account${n === 1 ? "" : "s"} — choose the store each one belongs to.` };
  } catch (e) {
    return adsError(e);
  }
}

export async function connectMetaAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const session = await requireAppSession();
  const accessToken = String(form.get("accessToken") ?? "").trim();
  if (!accessToken) return { ok: false, message: "Paste the system user access token." };
  try {
    const r = await connectMetaSystemUser(adsDeps(), session.scope, { accessToken, appId: String(form.get("appId") ?? "") || null, appSecret: String(form.get("appSecret") ?? "") || null });
    revalidatePath("/settings/stores");
    const n = r.accounts.length;
    return { ok: true, message: `Connected as ${r.userName}. Found ${n} ad account${n === 1 ? "" : "s"} — choose the store each one belongs to.` };
  } catch (e) {
    return adsError(e);
  }
}

export async function mapAdAccountAction(accountId: string, storeId: string | null, syncEnabled: boolean): Promise<ActionState> {
  const session = await requireAppSession();
  try {
    const r = await mapAdAccount(db(), session.scope, accountId, { storeId, syncEnabled });
    revalidatePath("/", "layout");
    if (!r.needsBackfill) return { ok: true, message: "Saved." };
    try {
      return { ok: true, message: `Saved. ${await syncNow(accountId, true)}` };
    } catch (e) {
      // The mapping is kept; the scheduled sync retries, and "Sync now" can be used after fixing access.
      return { ok: false, message: `Saved, but the first import failed: ${adsError(e).message}` };
    }
  } catch (e) {
    return adsError(e);
  }
}

export async function syncAdAccountAction(accountId: string): Promise<ActionState> {
  const session = await requireAppSession();
  assertRole(session.scope, "editor");
  try {
    const [acct] = await db().select({ org: schema.adAccount.organizationId }).from(schema.adAccount).where(eq(schema.adAccount.id, accountId));
    if (acct?.org !== session.scope.organizationId) return { ok: false, message: "Ad account not found." };
    const message = await syncNow(accountId);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    return adsError(e);
  }
}

// ---------------------------------------------------------------- Payment processors (Stripe, PayPal)

function paymentsError(e: unknown): ActionState {
  if (e instanceof GatewayApiError || e instanceof TenantAccessError) return { ok: false, message: e.message };
  console.error("payments action", e);
  return { ok: false, message: "Unexpected error talking to the payment processor. Nothing was changed." };
}

function syncSummary(r: GatewaySyncResult): string {
  const open = r.unmatched + r.ambiguous;
  return `Imported ${r.imported} payment${r.imported === 1 ? "" : "s"}: ${r.matched} matched to Shopify orders, ${open} left on the estimated fee${r.ordersRecalculated ? `; ${r.ordersRecalculated} order${r.ordersRecalculated === 1 ? "" : "s"} recalculated` : ""}.`;
}

export async function connectPaymentGatewayAction(_prev: ActionState | null, form: FormData): Promise<ActionState> {
  const session = await requireAppSession();
  const gateway = form.get("gateway");
  const storeId = String(form.get("storeId") ?? "");
  if (gateway !== "stripe" && gateway !== "paypal") return { ok: false, message: "Choose Stripe or PayPal." };
  if (!storeId) return { ok: false, message: "Choose the store whose payments this account takes." };
  const field = (name: string) => String(form.get(name) ?? "").trim();
  try {
    const { connectionId } = await connectPaymentGateway(adsDeps(), session.scope, {
      storeId,
      gateway,
      ...(gateway === "stripe" ? { secretKey: field("secretKey") } : { clientId: field("clientId"), clientSecret: field("clientSecret") }),
    });
    revalidatePath("/settings/stores");
    try {
      const r = await syncPaymentGateway(adsDeps(), connectionId);
      revalidatePath("/", "layout");
      return { ok: true, message: `Connected. ${syncSummary(r)}` };
    } catch (e) {
      // The connection is kept; the scheduled sync retries, and "Sync now" can be used after fixing access.
      return { ok: false, message: `Connected, but the first import failed: ${paymentsError(e).message}` };
    }
  } catch (e) {
    return paymentsError(e);
  }
}

export async function syncPaymentConnectionAction(connectionId: string): Promise<ActionState> {
  const session = await requireAppSession();
  assertRole(session.scope, "editor");
  try {
    const [conn] = await db().select({ org: schema.paymentConnection.organizationId }).from(schema.paymentConnection).where(eq(schema.paymentConnection.id, connectionId));
    if (conn?.org !== session.scope.organizationId) return { ok: false, message: "Payment connection not found." };
    const r = await syncPaymentGateway(adsDeps(), connectionId);
    revalidatePath("/", "layout");
    return { ok: true, message: syncSummary(r) };
  } catch (e) {
    return paymentsError(e);
  }
}
