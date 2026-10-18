import "server-only";
import { ReportingService, type ReportingDataSource, type StoreSummary } from "@profitlens/core";
import { DemoDataSource, DEMO_STORE } from "@profitlens/core/demo";
import { schema, type OrgScope } from "@profitlens/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "./db";

const globalForReporting = globalThis as unknown as { __demoSource?: DemoDataSource };

function demoSource(): DemoDataSource {
  if (!globalForReporting.__demoSource) globalForReporting.__demoSource = new DemoDataSource();
  return globalForReporting.__demoSource;
}

export type ReportingAccess =
  | { kind: "ready"; source: ReportingDataSource; service: ReportingService }
  /** Live store whose raw data is imported, but the profit engine (phase 5) has not been applied yet. */
  | { kind: "engine_pending"; store: StoreSummary };

/** Live (Shopify-connected) stores of the caller's organization. */
export async function liveStores(scope: OrgScope): Promise<StoreSummary[]> {
  const rows = await db()
    .select({ store: schema.store, connection: schema.storeConnection })
    .from(schema.store)
    .leftJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id))
    .where(and(eq(schema.store.organizationId, scope.organizationId), eq(schema.store.isDemo, false), ne(schema.store.status, "uninstalled")))
    .orderBy(asc(schema.store.name));
  return rows.map(({ store, connection }) => ({
    id: store.id,
    name: store.name,
    currency: store.currency,
    timezone: store.ianaTimezone,
    isDemo: false,
    lastSyncedAt: connection?.ordersSyncedThrough?.toISOString() ?? null,
  }));
}

/**
 * Data source for a store the caller may access. The demo store is shared sample data (not tenant data).
 * Live stores are scoped to the caller's organization.
 */
export async function reportingFor(scope: OrgScope, storeId: string): Promise<ReportingAccess | null> {
  if (storeId === DEMO_STORE.id) {
    const source = demoSource();
    return { kind: "ready", source, service: new ReportingService(source) };
  }
  const live = (await liveStores(scope)).find((s) => s.id === storeId);
  return live ? { kind: "engine_pending", store: live } : null;
}

export async function listAccessibleStores(scope: OrgScope): Promise<StoreSummary[]> {
  return [...(await liveStores(scope)), ...(await demoSource().listStores())];
}
