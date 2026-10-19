import "server-only";
import { schema, type OrgScope } from "@profitlens/db";
import { asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export interface AppSession {
  readonly user: { readonly id: string; readonly name: string; readonly email: string };
  readonly scope: OrgScope;
  readonly organizationName: string;
}

/** Cookie holding the workspace the user last switched to (only honoured while they are a member of it). */
export const ACTIVE_ORG_COOKIE = "pl_org";

/** Resolves the signed-in user and their organization scope; null when signed out. Cached per request. */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const rows = await db()
    .select({ organizationId: schema.membership.organizationId, role: schema.membership.role, name: schema.organization.name })
    .from(schema.membership)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.membership.organizationId))
    .where(eq(schema.membership.userId, session.user.id))
    .orderBy(asc(schema.membership.createdAt));
  const active = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const m = rows.find((r) => r.organizationId === active) ?? rows[0];
  if (!m) return null;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    scope: { userId: session.user.id, organizationId: m.organizationId, role: m.role },
    organizationName: m.name,
  };
});

/** Makes `organizationId` the active workspace (callers check membership first). */
export async function setActiveOrganization(organizationId: string): Promise<void> {
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function requireAppSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return session;
}
