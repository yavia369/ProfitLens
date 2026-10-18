import "server-only";
import { ReportingService, type ReportingDataSource, type StoreSummary } from "@profitlens/core";
import { DemoDataSource, DEMO_STORE } from "@profitlens/core/demo";
import type { OrgScope } from "@profitlens/db";

const globalForReporting = globalThis as unknown as { __demoSource?: DemoDataSource };

function demoSource(): DemoDataSource {
  if (!globalForReporting.__demoSource) globalForReporting.__demoSource = new DemoDataSource();
  return globalForReporting.__demoSource;
}

/**
 * Picks the data source for a store the caller may access. The demo store is shared sample data
 * (not tenant data). Live stores will be served by the database-backed source in Phase 4–5 and are
 * checked against the caller's organization scope there.
 */
export async function reportingFor(_scope: OrgScope, storeId: string): Promise<{ source: ReportingDataSource; service: ReportingService } | null> {
  if (storeId === DEMO_STORE.id) {
    const source = demoSource();
    return { source, service: new ReportingService(source) };
  }
  return null;
}

export async function listAccessibleStores(_scope: OrgScope): Promise<StoreSummary[]> {
  // Live stores join this list once Shopify connection exists (Phase 4).
  return demoSource().listStores();
}
