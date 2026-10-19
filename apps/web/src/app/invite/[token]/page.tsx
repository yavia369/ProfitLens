import { lookupInvitation } from "@profitlens/core/team";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { AcceptInvitation } from "@/components/team/accept-invitation";
import { ROLE_LABEL } from "@/components/team/roles";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

const MESSAGE = {
  expired: "This invitation has expired. Ask the person who invited you for a new link.",
  accepted: "This invitation has already been used.",
  revoked: "This invitation was withdrawn.",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await lookupInvitation(db(), token) : null;
  const session = await auth().api.getSession({ headers: await headers() });
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <Logo />
        </div>
        {!inv ? (
          <p className="text-sm">This invitation link is not valid.</p>
        ) : inv.status !== "valid" ? (
          <p className="text-sm">{MESSAGE[inv.status]}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-semibold">Join {inv.organizationName}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You are invited as {ROLE_LABEL[inv.role]?.toLowerCase()} ({inv.email}).
              </p>
            </div>
            {session ? (
              session.user.email.toLowerCase() === inv.email ? (
                <AcceptInvitation token={token} />
              ) : (
                <p role="alert" className="rounded-md bg-negative-soft px-3 py-2 text-sm text-negative">
                  You are signed in as {session.user.email}. Sign out and sign in as {inv.email} to accept.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-2">
                <Link className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={`/signup?next=${next}&email=${encodeURIComponent(inv.email)}` as Route}>
                  Create an account
                </Link>
                <Link className="text-center text-sm font-medium text-primary hover:underline" href={`/login?next=${next}&email=${encodeURIComponent(inv.email)}` as Route}>
                  I already have an account
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
