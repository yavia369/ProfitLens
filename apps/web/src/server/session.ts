import "server-only";
import { schema, type OrgScope } from "@profitlens/db";
import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export interface AppSession {
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
  readonly scope: OrgScope;
  readonly organizationName: string;
}

/** Resolves the signed-in user and their organization scope; null when signed out. Cached per request. */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db()
    .select({ organizationId: schema.membership.organizationId, role: schema.membership.role, name: schema.organization.name })
    .from(schema.membership)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.membership.organizationId))
    .where(eq(schema.membership.userId, session.user.id))
    .orderBy(asc(schema.membership.createdAt))
    .limit(1);
  const m = rows[0];
  if (!m) return null;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    scope: { userId: session.user.id, organizationId: m.organizationId, role: m.role },
    organizationName: m.name,
  };
});

export async function requireAppSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return session;
}
