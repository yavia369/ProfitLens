"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/settings/actions";
import { acceptInvitationAction } from "@/app/(app)/settings/team/actions";
import { FormMessage } from "@/components/costs/form-message";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} onClick={() => start(async () => setState(await acceptInvitationAction(token)))}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
