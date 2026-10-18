import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { listAccessibleStores } from "@/server/reporting";
import { requireAppSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireAppSession();
  const stores = await listAccessibleStores(session.scope);
  return (
    <AppShell stores={stores} user={session.user} organization={session.organizationName}>
      {children}
    </AppShell>
  );
}
