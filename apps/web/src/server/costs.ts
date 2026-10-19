import "server-only";
import type { StoreSummary } from "@profitlens/core";
import { liveStores } from "./reporting";
import type { AppSession } from "./session";

/**
 * The connected store a cost/policy page edits: the one named in `?store=`, else the first connected store.
 * Costs are never configured for the demo store (its sample data is generated, not stored).
 */
export async function costStoreFor(session: AppSession, storeParam: string | string[] | undefined): Promise<{ store: StoreSummary | null; stores: StoreSummary[]; requestedDemo: boolean }> {
  const stores = await liveStores(session.scope);
  const wanted = typeof storeParam === "string" ? storeParam : undefined;
  return { store: stores.find((s) => s.id === wanted) ?? stores[0] ?? null, stores, requestedDemo: wanted === "demo" };
}

export const canEdit = (session: AppSession) => session.scope.role !== "viewer";
