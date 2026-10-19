import { listTeam, listWorkspaces } from "@profitlens/core/team";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { grantableRoles, ROLE_DESCRIPTION, ROLE_LABEL } from "@/components/team/roles";
import { InviteForm, RemoveMemberButton, RevokeInvitationButton, RoleSelect, SwitchWorkspaceButton } from "@/components/team/team-controls";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const day = (d: Date) => formatDate(d.toISOString().slice(0, 10), { day: "numeric", month: "short", year: "numeric" });

export default async function TeamPage() {
  const session = await requireAppSession();
  const [{ members, invitations }, workspaces] = await Promise.all([listTeam(db(), session.scope), listWorkspaces(db(), session.user.id)]);
  const role = session.scope.role;
  const canManage = role === "owner" || role === "admin";
  const options = grantableRoles(role);
  const owners = members.filter((m) => m.role === "owner").length;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Team</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          People in <span className="font-medium text-foreground">{session.organizationName}</span>. You are {ROLE_LABEL[role]?.toLowerCase()}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>A workspace always keeps at least one owner.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Name</TH>
                <TH>Role</TH>
                <TH>Joined</TH>
                <TH className="pr-5 text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {members.map((m) => {
                const self = m.userId === session.user.id;
                // Admins cannot change or remove owners; nobody changes their own role here.
                const manageable = canManage && !self && (role === "owner" || m.role !== "owner");
                // The last owner cannot leave (the service refuses it too), so the button is not offered.
                const canLeave = self && !(m.role === "owner" && owners <= 1);
                return (
                  <TR key={m.membershipId}>
                    <TD className="pl-5">
                      <p className="font-medium">
                        {m.name} {self ? <Badge variant="outline">you</Badge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </TD>
                    <TD>{manageable ? <RoleSelect membershipId={m.membershipId} role={m.role} name={m.name} options={options} /> : ROLE_LABEL[m.role]}</TD>
                    <TD className="text-muted-foreground">{day(m.joinedAt)}</TD>
                    <TD className="pr-5 text-right">{manageable || canLeave ? <RemoveMemberButton membershipId={m.membershipId} name={m.name} self={self} /> : null}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invite someone</CardTitle>
              <CardDescription>
                Creates a one-time link for that email address, valid for 7 days. ProfitLens does not send email yet, so share the link yourself.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5">
            <InviteForm myRole={role} />
            {invitations.length ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">Open invitations</h3>
                <ul className="divide-y rounded-md border">
                  {invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        {i.email} · {ROLE_LABEL[i.role]}
                        <span className="block text-xs text-muted-foreground">
                          Expires {day(i.expiresAt)}
                          {i.invitedBy ? ` · invited by ${i.invitedBy}` : ""}
                        </span>
                      </span>
                      <RevokeInvitationButton invitationId={i.id} email={i.email} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Roles</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
            {Object.entries(ROLE_DESCRIPTION).map(([r, d]) => (
              <div key={r} className="contents">
                <dt className="font-medium">{ROLE_LABEL[r]}</dt>
                <dd className="text-muted-foreground">{d}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {workspaces.length > 1 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Your workspaces</CardTitle>
              <CardDescription>You belong to more than one workspace. Reports and settings show the active one.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {workspaces.map((w) => (
                <li key={w.organizationId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {w.name} · {ROLE_LABEL[w.role]}
                  </span>
                  {w.organizationId === session.scope.organizationId ? <Badge variant="primary">active</Badge> : <SwitchWorkspaceButton organizationId={w.organizationId} />}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
