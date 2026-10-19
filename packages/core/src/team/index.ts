import { createHash, randomBytes } from "node:crypto";
import { assertRole, schema, type Database, type MemberRole, type OrgScope } from "@profitlens/db";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

export const INVITATION_TTL_DAYS = 7;
export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const satisfies readonly MemberRole[];

/** A team change that is not allowed; the message is safe to show to the user. */
export class TeamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamError";
  }
}

export interface TeamMember {
  readonly membershipId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly joinedAt: Date;
}

export interface OpenInvitation {
  readonly id: string;
  readonly email: string;
  readonly role: MemberRole;
  readonly expiresAt: Date;
  readonly invitedBy: string | null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function audit(db: Database, scope: OrgScope, action: string, entityId: string, before: unknown, after: unknown) {
  await db.insert(schema.auditLog).values({
    organizationId: scope.organizationId,
    actorUserId: scope.userId,
    action,
    entityType: action.split(".")[0]!,
    entityId,
    before: before as Record<string, unknown> | null,
    after: after as Record<string, unknown> | null,
  });
}

/** Only owners may grant, change or remove the owner role; admins manage everyone else. */
function assertCanManage(scope: OrgScope, ...roles: MemberRole[]) {
  assertRole(scope, "admin");
  if (roles.includes("owner") && scope.role !== "owner") throw new TeamError("Only an owner can grant or change the owner role.");
}

export async function listTeam(db: Database, scope: OrgScope, now: Date = new Date()): Promise<{ members: TeamMember[]; invitations: OpenInvitation[] }> {
  const members = await db
    .select({
      membershipId: schema.membership.id,
      userId: schema.membership.userId,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.membership.role,
      joinedAt: schema.membership.createdAt,
    })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(eq(schema.membership.organizationId, scope.organizationId))
    .orderBy(asc(schema.membership.createdAt));
  // Invitations (who is invited, and by whom) are visible to admins and owners only.
  const invitations =
    scope.role === "owner" || scope.role === "admin"
      ? await db
          .select({ id: schema.invitation.id, email: schema.invitation.email, role: schema.invitation.role, expiresAt: schema.invitation.expiresAt, invitedBy: schema.user.name })
          .from(schema.invitation)
          .leftJoin(schema.user, eq(schema.user.id, schema.invitation.invitedByUserId))
          .where(and(eq(schema.invitation.organizationId, scope.organizationId), isNull(schema.invitation.acceptedAt), isNull(schema.invitation.revokedAt), gt(schema.invitation.expiresAt, now)))
          .orderBy(asc(schema.invitation.createdAt))
      : [];
  return { members, invitations };
}

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(MEMBER_ROLES, { error: "Choose a role." }),
});

/**
 * Creates an invitation and returns its one-time token (shown once; only its hash is stored). Inviting an
 * email that already has an open invitation replaces it, so only the newest link works.
 */
export async function createInvitation(db: Database, scope: OrgScope, raw: { email: string; role: string }, now: Date = new Date()): Promise<{ id: string; token: string; expiresAt: Date }> {
  const input = invitationSchema.parse(raw);
  assertCanManage(scope, input.role);
  const [existing] = await db
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.organizationId, scope.organizationId), sql`lower(${schema.user.email}) = ${input.email}`));
  if (existing) throw new TeamError(`${input.email} is already a member of this workspace.`);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
  const id = await db.transaction(async (tx) => {
    await tx
      .update(schema.invitation)
      .set({ revokedAt: now })
      .where(and(eq(schema.invitation.organizationId, scope.organizationId), eq(schema.invitation.email, input.email), isNull(schema.invitation.acceptedAt), isNull(schema.invitation.revokedAt)));
    const [row] = await tx
      .insert(schema.invitation)
      .values({ organizationId: scope.organizationId, email: input.email, role: input.role, tokenHash: hashToken(token), invitedByUserId: scope.userId, expiresAt })
      .returning({ id: schema.invitation.id });
    return row!.id;
  });
  await audit(db, scope, "invitation.create", id, null, { email: input.email, role: input.role, expiresAt: expiresAt.toISOString() });
  return { id, token, expiresAt };
}

export async function revokeInvitation(db: Database, scope: OrgScope, invitationId: string, now: Date = new Date()): Promise<void> {
  assertCanManage(scope);
  const [row] = await db
    .update(schema.invitation)
    .set({ revokedAt: now })
    .where(and(eq(schema.invitation.id, invitationId), eq(schema.invitation.organizationId, scope.organizationId), isNull(schema.invitation.acceptedAt), isNull(schema.invitation.revokedAt)))
    .returning({ email: schema.invitation.email, role: schema.invitation.role });
  if (!row) throw new TeamError("This invitation is no longer open.");
  await audit(db, scope, "invitation.revoke", invitationId, row, null);
}

export type InvitationStatus = "valid" | "expired" | "accepted" | "revoked";

/** What an invitation link points to (no secrets). Null for an unknown token. */
export async function lookupInvitation(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<{ organizationName: string; email: string; role: MemberRole; status: InvitationStatus } | null> {
  const [row] = await db
    .select({ inv: schema.invitation, organizationName: schema.organization.name })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .where(eq(schema.invitation.tokenHash, hashToken(token)));
  if (!row) return null;
  const { inv } = row;
  const status: InvitationStatus = inv.acceptedAt ? "accepted" : inv.revokedAt ? "revoked" : inv.expiresAt <= now ? "expired" : "valid";
  return { organizationName: row.organizationName, email: inv.email, role: inv.role, status };
}

/**
 * Accepts an invitation for the signed-in user. The user's email must be the invited one, so a forwarded link
 * is useless to anyone else. An existing member keeps their current role.
 */
export async function acceptInvitation(db: Database, token: string, user: { id: string; email: string }, now: Date = new Date()): Promise<{ organizationId: string; role: MemberRole }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invitation).where(eq(schema.invitation.tokenHash, hashToken(token))).for("update");
    if (!inv) throw new TeamError("This invitation link is not valid.");
    if (inv.acceptedAt || inv.revokedAt) throw new TeamError("This invitation has already been used or was withdrawn.");
    if (inv.expiresAt <= now) throw new TeamError("This invitation has expired. Ask for a new one.");
    if (inv.email !== user.email.trim().toLowerCase()) throw new TeamError(`This invitation is for ${inv.email}. Sign in with that email to accept it.`);
    await tx.insert(schema.membership).values({ organizationId: inv.organizationId, userId: user.id, role: inv.role }).onConflictDoNothing();
    const [m] = await tx
      .select({ role: schema.membership.role })
      .from(schema.membership)
      .where(and(eq(schema.membership.organizationId, inv.organizationId), eq(schema.membership.userId, user.id)));
    await tx.update(schema.invitation).set({ acceptedAt: now, acceptedByUserId: user.id }).where(eq(schema.invitation.id, inv.id));
    await tx.insert(schema.auditLog).values({
      organizationId: inv.organizationId,
      actorUserId: user.id,
      action: "invitation.accept",
      entityType: "invitation",
      entityId: inv.id,
      after: { role: m!.role },
    });
    return { organizationId: inv.organizationId, role: m!.role };
  });
}

async function memberOf(db: Database, scope: OrgScope, membershipId: string) {
  const [m] = await db
    .select()
    .from(schema.membership)
    .where(and(eq(schema.membership.id, membershipId), eq(schema.membership.organizationId, scope.organizationId)));
  if (!m) throw new TeamError("This person is not a member of this workspace.");
  return m;
}

/** Locks the organization's owner rows and returns how many there are (serialises last-owner checks). */
async function lockedOwnerCount(tx: Database, organizationId: string): Promise<number> {
  const owners = await tx
    .select({ id: schema.membership.id })
    .from(schema.membership)
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.role, "owner")))
    .for("update");
  return owners.length;
}

const LAST_OWNER = "A workspace needs at least one owner. Make someone else an owner first.";

export async function changeMemberRole(db: Database, scope: OrgScope, membershipId: string, rawRole: string): Promise<void> {
  const role = z.enum(MEMBER_ROLES).parse(rawRole);
  const m = await memberOf(db, scope, membershipId);
  if (m.role === role) return;
  assertCanManage(scope, m.role, role);
  await db.transaction(async (tx) => {
    if (m.role === "owner" && (await lockedOwnerCount(tx, scope.organizationId)) <= 1) throw new TeamError(LAST_OWNER);
    await tx.update(schema.membership).set({ role }).where(eq(schema.membership.id, m.id));
  });
  await audit(db, scope, "membership.role", m.id, { userId: m.userId, role: m.role }, { userId: m.userId, role });
}

/** Removes a member (admins and owners), or lets any member leave (their own membership). */
export async function removeMember(db: Database, scope: OrgScope, membershipId: string): Promise<void> {
  const m = await memberOf(db, scope, membershipId);
  if (m.userId !== scope.userId) assertCanManage(scope, m.role);
  await db.transaction(async (tx) => {
    if (m.role === "owner" && (await lockedOwnerCount(tx, scope.organizationId)) <= 1) throw new TeamError(LAST_OWNER);
    await tx.delete(schema.membership).where(eq(schema.membership.id, m.id));
  });
  await audit(db, scope, m.userId === scope.userId ? "membership.leave" : "membership.remove", m.id, { userId: m.userId, role: m.role }, null);
}

/** Workspaces the user belongs to (for switching). */
export async function listWorkspaces(db: Database, userId: string): Promise<{ organizationId: string; name: string; role: MemberRole }[]> {
  return db
    .select({ organizationId: schema.membership.organizationId, name: schema.organization.name, role: schema.membership.role })
    .from(schema.membership)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.membership.organizationId))
    .where(eq(schema.membership.userId, userId))
    .orderBy(asc(schema.membership.createdAt));
}
