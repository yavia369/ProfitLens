import { createDb, createPool, schema, type Database, type MemberRole, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acceptInvitation, changeMemberRole, createInvitation, listTeam, listWorkspaces, lookupInvitation, removeMember, revokeInvitation, TeamError } from "../src/team";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
const NOW = new Date("2026-10-19T03:00:00Z");
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "team"), 4);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "organization", "user" RESTART IDENTITY CASCADE`);
});

async function user(id: string, email: string) {
  await db.insert(schema.user).values({ id, name: id, email, emailVerified: false });
  return { id, email };
}
async function org(ownerId: string): Promise<OrgScope> {
  const [o] = await db.insert(schema.organization).values({ name: `${ownerId}'s workspace` }).returning();
  await db.insert(schema.membership).values({ organizationId: o!.id, userId: ownerId, role: "owner" });
  return { userId: ownerId, organizationId: o!.id, role: "owner" };
}
const as = (scope: OrgScope, userId: string, role: MemberRole): OrgScope => ({ ...scope, userId, role });
const membershipOf = async (scope: OrgScope, userId: string) =>
  (await listTeam(db, scope, NOW)).members.find((m) => m.userId === userId)!.membershipId;

describe("team: invitations, roles and removal (real Postgres)", () => {
  it("invites by email with a one-time link bound to that email; accepting adds a member", async () => {
    await user("ann", "ann@example.com");
    const ben = await user("ben", "Ben@Example.com");
    const eve = await user("eve", "eve@example.com");
    const scope = await org("ann");

    const inv = await createInvitation(db, scope, { email: " BEN@example.com ", role: "editor" }, NOW);
    expect(inv.token.length).toBeGreaterThanOrEqual(43);
    const [stored] = await db.select().from(schema.invitation);
    expect(stored!.tokenHash).not.toContain(inv.token); // only the hash is stored
    expect(await lookupInvitation(db, inv.token, NOW)).toMatchObject({ email: "ben@example.com", role: "editor", status: "valid" });
    expect(await lookupInvitation(db, "nope", NOW)).toBeNull();

    // Someone else holding the link cannot use it.
    await expect(acceptInvitation(db, inv.token, eve, NOW)).rejects.toThrow(/for ben@example.com/);
    expect(await acceptInvitation(db, inv.token, ben, NOW)).toEqual({ organizationId: scope.organizationId, role: "editor" });
    await expect(acceptInvitation(db, inv.token, ben, NOW)).rejects.toBeInstanceOf(TeamError); // one-time
    expect((await listTeam(db, scope, NOW)).members.map((m) => [m.userId, m.role])).toEqual([
      ["ann", "owner"],
      ["ben", "editor"],
    ]);
    expect((await listWorkspaces(db, "ben")).map((w) => w.organizationId)).toEqual([scope.organizationId]);
    await expect(createInvitation(db, scope, { email: "ben@example.com", role: "viewer" }, NOW)).rejects.toThrow(/already a member/);
    const audit = await db.select({ action: schema.auditLog.action }).from(schema.auditLog);
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["invitation.create", "invitation.accept"]));
  });

  it("re-inviting replaces the open link; revoked and expired links do not work", async () => {
    await user("ann", "ann@example.com");
    const cat = await user("cat", "cat@example.com");
    const scope = await org("ann");
    const first = await createInvitation(db, scope, { email: "cat@example.com", role: "viewer" }, NOW);
    const second = await createInvitation(db, scope, { email: "cat@example.com", role: "admin" }, NOW);
    expect((await lookupInvitation(db, first.token, NOW))!.status).toBe("revoked");
    expect((await listTeam(db, scope, NOW)).invitations).toEqual([expect.objectContaining({ email: "cat@example.com", role: "admin", invitedBy: "ann" })]);
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect((await lookupInvitation(db, second.token, later))!.status).toBe("expired");
    await expect(acceptInvitation(db, second.token, cat, later)).rejects.toThrow(/expired/);
    await revokeInvitation(db, scope, second.id, NOW);
    await expect(acceptInvitation(db, second.token, cat, NOW)).rejects.toThrow(/withdrawn/);
    await expect(revokeInvitation(db, scope, second.id, NOW)).rejects.toBeInstanceOf(TeamError);
  });

  it("enforces who may manage whom, and never leaves a workspace without an owner", async () => {
    await user("ann", "ann@example.com");
    await user("ben", "ben@example.com");
    await user("dan", "dan@example.com");
    const scope = await org("ann");
    for (const [id, role] of [["ben", "admin"], ["dan", "viewer"]] as const) await db.insert(schema.membership).values({ organizationId: scope.organizationId, userId: id, role });
    const ben = as(scope, "ben", "admin");
    const dan = as(scope, "dan", "viewer");
    const annM = await membershipOf(scope, "ann");
    const danM = await membershipOf(scope, "dan");

    // Viewers and editors cannot manage; viewers do not see invitations.
    await expect(createInvitation(db, dan, { email: "x@example.com", role: "viewer" }, NOW)).rejects.toThrow(/permission/);
    expect((await listTeam(db, dan, NOW)).invitations).toEqual([]);
    // Admins manage non-owners only.
    await changeMemberRole(db, ben, danM, "editor");
    await expect(changeMemberRole(db, ben, danM, "owner")).rejects.toThrow(/Only an owner/);
    await expect(changeMemberRole(db, ben, annM, "admin")).rejects.toThrow(/Only an owner/);
    await expect(createInvitation(db, ben, { email: "x@example.com", role: "owner" }, NOW)).rejects.toThrow(/Only an owner/);
    await expect(removeMember(db, ben, annM)).rejects.toThrow(/Only an owner/);
    // The last owner can neither be demoted nor leave; with a second owner they can.
    await expect(changeMemberRole(db, scope, annM, "admin")).rejects.toThrow(/at least one owner/);
    await expect(removeMember(db, scope, annM)).rejects.toThrow(/at least one owner/);
    await changeMemberRole(db, scope, await membershipOf(scope, "ben"), "owner");
    await removeMember(db, scope, annM); // ann leaves
    expect((await listTeam(db, as(scope, "ben", "owner"), NOW)).members.map((m) => m.userId)).toEqual(["ben", "dan"]);
    // Any member may leave on their own.
    await removeMember(db, as(scope, "dan", "editor"), danM);
    expect(await db.select().from(schema.membership).where(eq(schema.membership.userId, "dan"))).toEqual([]);
    await expect(changeMemberRole(db, as(scope, "ben", "owner"), danM, "viewer")).rejects.toThrow(/not a member/);
  });

  it("is tenant-scoped: another workspace's members and invitations are out of reach", async () => {
    await user("ann", "ann@example.com");
    await user("zed", "zed@example.com");
    const a = await org("ann");
    const z = await org("zed");
    const inv = await createInvitation(db, a, { email: "new@example.com", role: "viewer" }, NOW);
    await expect(revokeInvitation(db, z, inv.id, NOW)).rejects.toBeInstanceOf(TeamError);
    await expect(removeMember(db, z, await membershipOf(a, "ann"))).rejects.toThrow(/not a member/);
    expect((await listTeam(db, z, NOW)).invitations).toEqual([]);
  });
});
