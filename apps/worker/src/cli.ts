import { connectStoreWithClientCredentials, ShopifySyncService } from "@profitlens/core/shopify";
import { resolveScope, schema } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { buildDeps, log } from "./deps";

/**
 * Operator CLI (runs jobs inline, without the queue):
 *   pnpm --filter @profitlens/worker sync connect <user-email>      # uses SHOPIFY_SHOP_DOMAIN/CLIENT_ID/CLIENT_SECRET
 *   pnpm --filter @profitlens/worker sync backfill <storeId>
 *   pnpm --filter @profitlens/worker sync incremental <storeId>
 *   pnpm --filter @profitlens/worker sync reconcile <storeId> [days]
 *   pnpm --filter @profitlens/worker sync status
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

function required(v: string | undefined): string {
  if (!v) throw new Error("storeId is required");
  return v;
}

main().catch((error) => {
  log.error({ err: error }, "command failed");
  process.exit(1);
});
