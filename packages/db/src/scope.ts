import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { membership, store, type memberRole } from "./schema/index";

export type MemberRole = (typeof memberRole.enumValues)[number];

/**
 * Tenant scope resolved from the authenticated session. Every repository/service call that reads
 * or writes tenant data must receive a scope; store ids are always re-checked against it.
 */
export interface OrgScope {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: MemberRole;
}

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantAccessError";
  }
}

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function assertRole(scope: OrgScope, minimum: MemberRole): void {
  if (ROLE_RANK[scope.role] < ROLE_RANK[minimum]) {
    throw new TenantAccessError(`role ${scope.role} lacks ${minimum} permission`);
  }
}

export async function resolveScope(db: Database, userId: string, organizationId: string): Promise<OrgScope> {
  const rows = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.organizationId, organizationId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new TenantAccessError("user is not a member of this organization");
  return { userId, organizationId, role: row.role };
}

/** Returns the requested store ids if they all belong to the scope's organization; throws otherwise. */
export async function assertStoresInScope(db: Database, scope: OrgScope, storeIds: readonly string[]): Promise<string[]> {
  if (storeIds.length === 0) return [];
  const unique = [...new Set(storeIds)];
  const rows = await db
    .select({ id: store.id })
    .from(store)
    .where(and(eq(store.organizationId, scope.organizationId), inArray(store.id, unique)));
  if (rows.length !== unique.length) throw new TenantAccessError("store is not accessible in this organization");
  return unique;
}
