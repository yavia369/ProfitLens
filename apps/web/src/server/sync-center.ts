import "server-only";
import { REQUIRED_SCOPES } from "@profitlens/core/shopify";
import { schema, type OrgScope } from "@profitlens/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";

export interface SyncCenterStore {
  id: string;
  name: string;
  shopDomain: string;
  currency: string;
  timezone: string;
  plan: string | null;
  connection: {
    status: string;
    lastError: string | null;
    scopes: string[];
    missingRequired: string[];
    historyLimited: boolean;
    ordersSyncedThrough: string | null;
    backfillStartedAt: string | null;
    backfillCompletedAt: string | null;
    historyStart: string | null;
  } | null;
  counts: Record<"orders" | "lineItems" | "salesEntries" | "refunds" | "transactions" | "transactionsWithFees" | "products" | "variants" | "variantsWithCost" | "costVersions" | "customers" | "disputes", number>;
  jobs: { id: string; kind: string; status: string; startedAt: string | null; finishedAt: string | null; stats: Record<string, number> | null; progress: { done: number; total: number | null; unit: string } | null; error: string | null }[];
  issues: { localDate: string; metric: string; expected: string; actual: string }[];
  latestOrders: { name: string; localDate: string; financialStatus: string | null; totalPrice: string | null; currency: string; ledgerEntries: number }[];
  webhooks24h: number;
}

const n = (rows: unknown) => Number((rows as { rows: { n: number }[] }).rows[0]?.n ?? 0);

export async function loadSyncCenter(scope: OrgScope): Promise<SyncCenterStore[]> {
  const d = db();
  const stores = await d
    .select({ store: schema.store, connection: schema.storeConnection })
    .from(schema.store)
    .leftJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id))
    .where(and(eq(schema.store.organizationId, scope.organizationId), eq(schema.store.isDemo, false)));

  return Promise.all(
    stores.map(async ({ store, connection }) => {
      const id = store.id;
      // Table names and filters are compile-time constants; the store id is a bound parameter.
      const count = async (table: string, extra = "") => n(await d.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where store_id = ${id} ${sql.raw(extra)}`));
      const [orders, lineItems, salesEntries, refunds, transactions, transactionsWithFees, products, variants, variantsWithCost, costVersions, customers, disputes] = await Promise.all([
        count("order"),
        count("order_line_item"),
        count("sale_ledger_entry"),
        count("refund"),
        count("payment_transaction"),
        count("payment_transaction", "and fee_amount is not null"),
        count("product", "and deleted_at is null"),
        count("variant", "and deleted_at is null"),
        n(await d.execute(sql`select count(distinct variant_id)::int as n from variant_cost_version where store_id = ${id} and effective_to is null`)),
        count("variant_cost_version"),
        count("customer"),
        count("dispute"),
      ]);
      const jobs = await d.select().from(schema.syncJob).where(eq(schema.syncJob.storeId, id)).orderBy(desc(schema.syncJob.queuedAt)).limit(10);
      const issues = await d
        .select()
        .from(schema.reconciliationIssue)
        .where(and(eq(schema.reconciliationIssue.storeId, id), isNull(schema.reconciliationIssue.resolvedAt)))
        .orderBy(desc(schema.reconciliationIssue.localDate))
        .limit(10);
      const latest = (await d.execute(sql`
        select o.name, o.processed_local_date as "localDate", o.financial_status as "financialStatus", o.total_price as "totalPrice", o.currency,
               (select count(*)::int from sale_ledger_entry s where s.order_id = o.id) as "ledgerEntries"
        from "order" o where o.store_id = ${id} order by o.processed_at desc limit 10`)).rows as SyncCenterStore["latestOrders"];
      const webhooks24h = n(await d.execute(sql`select count(*)::int as n from webhook_event where store_id = ${id} and received_at > now() - interval '24 hours'`));
      const scopes = connection?.grantedScopes.split(",").filter(Boolean) ?? [];
      return {
        id,
        name: store.name,
        shopDomain: store.shopDomain,
        currency: store.currency,
        timezone: store.ianaTimezone,
        plan: store.shopifyPlan,
        connection: connection
          ? {
              status: connection.status,
              lastError: connection.lastError,
              scopes,
              missingRequired: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)),
              historyLimited: !scopes.includes("read_all_orders"),
              ordersSyncedThrough: connection.ordersSyncedThrough?.toISOString() ?? null,
              backfillStartedAt: connection.backfillStartedAt?.toISOString() ?? null,
              backfillCompletedAt: connection.backfillCompletedAt?.toISOString() ?? null,
              historyStart: connection.historyStart,
            }
          : null,
        counts: { orders, lineItems, salesEntries, refunds, transactions, transactionsWithFees, products, variants, variantsWithCost, costVersions, customers, disputes },
        jobs: jobs.map((j) => ({
          id: j.id,
          kind: j.kind,
          status: j.status,
          startedAt: j.startedAt?.toISOString() ?? null,
          finishedAt: j.finishedAt?.toISOString() ?? null,
          stats: j.stats ?? null,
          progress: j.progress ?? null,
          error: j.lastError,
        })),
        issues: issues.map((i) => ({ localDate: i.localDate, metric: i.metric, expected: i.expected, actual: i.actual })),
        latestOrders: latest,
        webhooks24h,
      };
    }),
  );
}
