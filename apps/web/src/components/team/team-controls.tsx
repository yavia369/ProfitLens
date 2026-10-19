"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/settings/actions";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction, switchWorkspaceAction } from "@/app/(app)/settings/team/actions";
import { FormMessage } from "@/components/costs/form-message";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { grantableRoles, ROLE_LABEL } from "./roles";

export function InviteForm({ myRole }: { myRole: string }) {
  const [state, action, pending] = useActionState<(ActionState & { link?: string }) | null, FormData>(inviteMemberAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required placeholder="name@company.com" autoComplete="off" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <NativeSelect id="invite-role" name="role" defaultValue="viewer">
            {grantableRoles(myRole).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create invitation"}
        </Button>
      </div>
      <FormMessage state={state} />
      {state?.ok && state.link ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={state.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(state.link!);
              setCopied(true);
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function RoleSelect({ membershipId, role, name, options }: { membershipId: string; role: string; name: string; options: readonly string[] }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  // Show the current role even when this user may not grant it (e.g. an admin looking at an owner).
  const all = options.includes(role) ? options : [role, ...options];
  return (
    <div className="grid gap-1">
      <NativeSelect
        aria-label={`Role of ${name}`}
        defaultValue={role}
        disabled={pending || !options.includes(role)}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => setState(await changeRoleAction(membershipId, next)));
        }}
      >
        {all.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </NativeSelect>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </div>
  );
}

export function RemoveMemberButton({ membershipId, name, self }: { membershipId: string; name: string; self: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(self ? "Leave this workspace? You will lose access to its stores and reports." : `Remove ${name} from this workspace?`)) return;
          start(async () => setState(await removeMemberAction(membershipId, self)));
        }}
      >
        {self ? "Leave" : "Remove"}
      </Button>
      {state && !state.ok ? <FormMessage state={state} /> : null}
    </div>
  );
}

export function RevokeInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} aria-label={`Withdraw invitation for ${email}`} onClick={() => start(async () => void (await revokeInvitationAction(invitationId)))}>
      Withdraw
    </Button>
  );
}

export function SwitchWorkspaceButton({ organizationId }: { organizationId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(() => switchWorkspaceAction(organizationId))}>
      Switch
    </Button>
  );
}
