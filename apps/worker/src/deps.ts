import { getServerEnv } from "@profitlens/config";
import type { ShopifyDeps } from "@profitlens/core/shopify";
import { createDb, createPool } from "@profitlens/db";
import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: ["*.token", "*.accessToken", "*.clientSecret", "*.secret", "*.keyJson", "*.private_key", "*.privateKey", "*.appSecret", "*.accessTokenEnc", "*.credentialsEnc", "headers.authorization", "headers.cookie"], censor: "[redacted]" },
});

export function buildDeps(): ShopifyDeps & { databaseUrl: string } {
  const env = getServerEnv();
  const db = createDb(createPool(env.DATABASE_URL, 5));
  return {
    db,
    databaseUrl: env.DATABASE_URL,
    keyring: { keys: env.ENCRYPTION_KEYS, activeKid: env.ENCRYPTION_ACTIVE_KID },
    apiVersion: env.SHOPIFY_API_VERSION,
    log: (event, data) => log.debug(data, event),
  };
}
