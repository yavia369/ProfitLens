import "server-only";
import { ReportingService, type ReportingDataSource, type StoreSummary } from "@profitlens/core";
import { DemoDataSource, DEMO_STORE } from "@profitlens/core/demo";
import { DbReportingDataSource } from "@profitlens/core/profit";
import type { OrgScope } from "@profitlens/db";
import { db } from "./db";

const globalForReporting = globalThis as unknown as { __demoSource?: DemoDataSource };

function demoSource(): DemoDataSource {
  if (!globalForReporting.__demoSource) globalForReporting.__demoSource = new DemoDataSource();
  return globalForReporting.__demoSource;
}

export interface ReportingAccess {
  source: ReportingDataSource;
  service: ReportingService;
}

/** Live (Shopify-connected) stores of the caller's organization. */
export async function liveStores(scope: OrgScope): Promise<StoreSummary[]> {
  return new DbReportingDataSource(db(), scope.organizationId).listStores();
}

/**
 * Data source for a store the caller may access. The demo store is shared sample data (not tenant data).
 * Live stores are read from the profit results of the caller's organization only.
 */
export async function reportingFor(scope: OrgScope, storeId: string): Promise<ReportingAccess | null> {
  if (storeId === DEMO_STORE.id) {
    const source = demoSource();
    return { source, service: new ReportingService(source) };
  }
  const source = new DbReportingDataSource(db(), scope.organizationId);
  if (!(await source.getStore(storeId))) return null;
  return { source, service: new ReportingService(source) };
}

export async function listAccessibleStores(scope: OrgScope): Promise<StoreSummary[]> {
  return [...(await liveStores(scope)), ...(await demoSource().listStores())];
}
