import "server-only";
import { getServerEnv } from "@profitlens/config";
import { schema } from "@profitlens/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

function createAuth() {
  const env = getServerEnv();
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: env.NODE_ENV === "production" },
    // Brute-force protection per client IP (in-memory store; move to a shared store when scaling out).
    rateLimit: {
      enabled: env.NODE_ENV !== "development",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every new user gets their own organization (M1: one org per user; invites come later).
          after: async (user) => {
            await db().transaction(async (tx) => {
              const [org] = await tx
                .insert(schema.organization)
                .values({ name: `${user.name}'s workspace` })
                .returning({ id: schema.organization.id });
              await tx.insert(schema.membership).values({ organizationId: org!.id, userId: user.id, role: "owner" });
            });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __profitlensAuth?: Auth };

export function auth(): Auth {
  if (!globalForAuth.__profitlensAuth) globalForAuth.__profitlensAuth = createAuth();
  return globalForAuth.__profitlensAuth;
}
