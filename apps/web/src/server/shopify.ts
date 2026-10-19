import "server-only";
import { getServerEnv } from "@profitlens/config";
import type { AdsDeps } from "@profitlens/core/ads";
import type { JobSender } from "@profitlens/core/jobs";
import type { ShopifyDeps } from "@profitlens/core/shopify";
import { PgBoss } from "pg-boss";
import { db } from "./db";

export function shopifyDeps(): ShopifyDeps {
  const env = getServerEnv();
  return { db: db(), keyring: { keys: env.ENCRYPTION_KEYS, activeKid: env.ENCRYPTION_ACTIVE_KID }, apiVersion: env.SHOPIFY_API_VERSION };
}

const g = globalThis as unknown as { __profitlensBoss?: Promise<PgBoss> };

/** Send-only queue client: the worker process owns scheduling and maintenance. */
export function jobs(): JobSender {
  g.__profitlensBoss ??= (async () => {
    const boss = new PgBoss({ connectionString: getServerEnv().DATABASE_URL, schema: "pgboss", supervise: false, schedule: false, registerInstance: false });
    boss.on("error", (e) => console.error("pg-boss", e));
    await boss.start();
    return boss;
  })();
  return { send: async (name, data, options) => (await g.__profitlensBoss!).send(name, data ?? null, options ?? {}) };
}

/** Dependencies for Google Ads services (same key ring as Shopify credentials). */
export function adsDeps(): AdsDeps {
  const env = getServerEnv();
  return { db: db(), keyring: { keys: env.ENCRYPTION_KEYS, activeKid: env.ENCRYPTION_ACTIVE_KID } };
}
