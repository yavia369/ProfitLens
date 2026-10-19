"use server";

import { getServerEnv } from "@profitlens/config";
import { acceptInvitation, changeMemberRole, createInvitation, listWorkspaces, removeMember, revokeInvitation, TeamError } from "@profitlens/core/team";
import { TenantAccessError } from "@profitlens/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { requireAppSession, setActiveOrganization } from "@/server/session";
import { headers } from "next/headers";
import type { ActionState } from "../actions";

/** Known, user-safe failures become messages; anything else is logged and reported generically. */
function failure(e: unknown, where: string): ActionState {
  if (e instanceof TeamError) return { ok: false, message: e.message };
  if (e instanceof TenantAccessError) return { ok: false, message: "Your role does not allow this change." };
  if (e instanceof ZodError) return { ok: false, message: e.issues[0]?.message ?? "Check the form." };
  console.error(where, e);
  return { ok: false, message: "Unexpected error. Please try again." };
}

export async function inviteMemberAction(_prev: (ActionState & { link?: string }) | null, form: FormData): Promise<ActionState & { link?: string }> {
  const session = await requireAppSession();
  try {
    const { token, expiresAt } = await createInvitation(db(), session.scope, { email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "") });
    revalidatePath("/settings/team");
    return {
      ok: true,
      message: `Invitation created. Send this link to the person you invited; it works once, only for their email, until ${expiresAt.toISOString().slice(0, 10)}.`,
      link: `${getServerEnv().APP_URL.replace(/\/$/, "")}/invite/${token}`,
    };
  } catch (e) {
    return failure(e, "inviteMemberAction");
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const session = await requireAppSession();
  try {
    await revokeInvitation(db(), session.scope, invitationId);
    revalidatePath("/settings/team");
    return { ok: true, message: "Invitation withdrawn." };
  } catch (e) {
    return failure(e, "revokeInvitationAction");
  }
}

export async function changeRoleAction(membershipId: string, role: string): Promise<ActionState> {
  const session = await requireAppSession();
  try {
    await changeMemberRole(db(), session.scope, membershipId, role);
    revalidatePath("/settings/team");
    return { ok: true, message: "Role updated." };
  } catch (e) {
    return failure(e, "changeRoleAction");
  }
}

export async function removeMemberAction(membershipId: string, self: boolean): Promise<ActionState> {
  const session = await requireAppSession();
  try {
    await removeMember(db(), session.scope, membershipId);
  } catch (e) {
    return failure(e, "removeMemberAction");
  }
  if (self) redirect("/dashboard"); // the session falls back to another workspace
  revalidatePath("/settings/team");
  return { ok: true, message: "Member removed." };
}

export async function switchWorkspaceAction(organizationId: string): Promise<void> {
  const session = await requireAppSession();
  const workspaces = await listWorkspaces(db(), session.user.id);
  if (workspaces.some((w) => w.organizationId === organizationId)) await setActiveOrganization(organizationId);
  redirect("/dashboard");
}

export async function acceptInvitationAction(token: string): Promise<ActionState> {
  // The invitee may not have a workspace session yet in odd cases, so read the auth session directly.
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s) return { ok: false, message: "Sign in first." };
  let organizationId: string;
  try {
    ({ organizationId } = await acceptInvitation(db(), token, { id: s.user.id, email: s.user.email }));
  } catch (e) {
    return failure(e, "acceptInvitationAction");
  }
  await setActiveOrganization(organizationId);
  redirect("/dashboard");
}
