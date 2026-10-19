import { AdsSyncService, connectGoogleAdsServiceAccount, listAdAccounts, mapAdAccount } from "@profitlens/core/ads";
import { ProfitService } from "@profitlens/core/profit";
import { connectStoreWithClientCredentials, ShopifySyncService } from "@profitlens/core/shopify";
import { resolveScope, schema, type Database } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { buildDeps, log } from "./deps";

/**
 * Operator CLI (runs jobs inline, without the queue):
 *   pnpm --filter @profitlens/worker sync connect <user-email>      # uses SHOPIFY_SHOP_DOMAIN/CLIENT_ID/CLIENT_SECRET
 *   pnpm --filter @profitlens/worker sync backfill <storeId>
 *   pnpm --filter @profitlens/worker sync incremental <storeId>
 *   pnpm --filter @profitlens/worker sync reconcile <storeId> [days]
 *   pnpm --filter @profitlens/worker sync status
 *   pnpm --filter @profitlens/worker sync recalc <storeId> [--force]  # profit results + daily aggregates
 *   pnpm --filter @profitlens/worker sync ads-connect <user-email>       # uses GOOGLE_ADS_SERVICE_ACCOUNT_KEY (+ GOOGLE_ADS_LOGIN_CUSTOMER_ID)
 *   pnpm --filter @profitlens/worker sync ads-accounts <user-email>
 *   pnpm --filter @profitlens/worker sync ads-map <user-email> <adAccountId> <storeId|none>
 *   pnpm --filter @profitlens/worker sync ads-sync <adAccountId> [--full]
 */
async function main() {
  const [command, arg, arg2] = process.argv.slice(2);
  const deps = buildDeps();
  const sync = new ShopifySyncService(deps);
  switch (command) {
    case "connect": {
      if (!arg) throw new Error("usage: connect <user-email>");
      const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET } = process.env;
      if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) throw new Error("SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set");
      const [u] = await deps.db.select().from(schema.user).where(eq(schema.user.email, arg));
      if (!u) throw new Error(`no user ${arg} — sign up in the web app first`);
      const [m] = await deps.db.select().from(schema.membership).where(eq(schema.membership.userId, u.id));
      const scope = await resolveScope(deps.db, u.id, m!.organizationId);
      const r = await connectStoreWithClientCredentials(deps, scope, { shopDomain: SHOPIFY_SHOP_DOMAIN, clientId: SHOPIFY_CLIENT_ID, clientSecret: SHOPIFY_CLIENT_SECRET });
      log.info({ ...r }, "connected");
      break;
    }
    case "backfill":
      log.info(await sync.backfill(required(arg)), "backfill done");
      break;
    case "incremental":
      log.info(await sync.incremental(required(arg)), "incremental done");
      break;
    case "reconcile":
      log.info(await sync.reconcileOrderCounts(required(arg), arg2 ? Number(arg2) : 7), "reconcile done");
      break;
    case "ads-connect": {
      const keyJson = process.env.GOOGLE_ADS_SERVICE_ACCOUNT_KEY;
      if (!keyJson) throw new Error("GOOGLE_ADS_SERVICE_ACCOUNT_KEY must be set (see docs/GOOGLE_ADS_SETUP.md)");
      const r = await connectGoogleAdsServiceAccount(deps, await scopeFor(deps.db, required(arg)), { keyJson, loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? null });
      log.info({ connectionId: r.connectionId, serviceAccount: r.serviceAccountEmail }, "connected");
      console.table(r.accounts.map((a) => ({ id: a.id, customerId: a.customerId, name: a.name, currency: a.currency, timezone: a.timezone, manager: a.isManager, status: a.status, storeId: a.storeId })));
      break;
    }
    case "ads-accounts":
      console.table(
        (await listAdAccounts(deps.db, await scopeFor(deps.db, required(arg)))).map(({ a, storeName }) => ({
          id: a.id,
          customerId: a.externalId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          manager: a.isManager,
          store: storeName,
          sync: a.syncEnabled,
          through: a.spendSyncedThrough,
          lastError: a.lastError,
        })),
      );
      break;
    case "ads-map": {
      const [, , , accountId, storeId] = process.argv.slice(2);
      log.info(await mapAdAccount(deps.db, await scopeFor(deps.db, required(arg)), required(accountId), { storeId: storeId === "none" ? null : required(storeId), syncEnabled: storeId !== "none" }), "mapped");
      break;
    }
    case "ads-sync":
      log.info(await new AdsSyncService(deps).syncAccount(required(arg), { full: arg2 === "--full" }), "ads sync done");
      break;
    case "recalc":
      log.info(await new ProfitService(deps.db).recalcStore(required(arg), { force: arg2 === "--force" }), "recalc done");
      break;
    case "status": {
      const rows = await deps.db
        .select({ id: schema.store.id, name: schema.store.name, domain: schema.store.shopDomain, status: schema.storeConnection.status, through: schema.storeConnection.ordersSyncedThrough, historyStart: schema.storeConnection.historyStart, scopes: schema.storeConnection.grantedScopes })
        .from(schema.store)
        .innerJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id));
      console.table(rows);
      break;
    }
    default:
      throw new Error(`unknown command ${command ?? ""}`);
  }
  process.exit(0);
}

/** Owner scope of the user's first workspace (operator CLI). */
async function scopeFor(db: Database, email: string) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (!u) throw new Error(`no user ${email}`);
  const [m] = await db.select().from(schema.membership).where(eq(schema.membership.userId, u.id));
  return resolveScope(db, u.id, m!.organizationId);
}

function required(v: string | undefined): string {
  if (!v) throw new Error("missing argument (see usage at the top of cli.ts)");
  return v;
}

main().catch((error) => {
  log.error({ err: error }, "command failed");
  process.exit(1);
});
