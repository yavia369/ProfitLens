import { z } from "zod";

const encryptionKeys = z
  .string()
  .transform((raw, ctx) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return z.record(z.string().min(1), z.string().min(1)).parse(parsed);
    } catch {
      ctx.addIssue({ code: "custom", message: "ENCRYPTION_KEYS must be a JSON object of kid -> base64 key" });
      return z.NEVER;
    }
  })
  .refine(
    (keys) => Object.values(keys).every((k) => Buffer.from(k, "base64").length === 32),
    "every ENCRYPTION_KEYS value must decode to exactly 32 bytes",
  );

/** Server-side environment. Never import this module from client components. */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    ENCRYPTION_KEYS: encryptionKeys,
    ENCRYPTION_ACTIVE_KID: z.string().min(1),
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-(01|04|07|10)$/).default("2026-10"),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /** Optional: server errors are also POSTed here as a short JSON report (apps/web/src/instrumentation.ts). */
    ERROR_REPORT_URL: z.url().optional(),
  })
  .refine((env) => env.ENCRYPTION_ACTIVE_KID in env.ENCRYPTION_KEYS, {
    message: "ENCRYPTION_ACTIVE_KID must be a key of ENCRYPTION_KEYS",
    path: ["ENCRYPTION_ACTIVE_KID"],
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parses process.env once; throws a readable error listing every invalid variable. */
export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid server environment:\n${issues.join("\n")}`);
  }
  if (source === process.env) cached = result.data;
  return result.data;
}
