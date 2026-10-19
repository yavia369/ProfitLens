import type { StoreSummary } from "@profitlens/core";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { StoresProvider } from "./stores-context";

export function AppShell({
  stores,
  user,
  organization,
  children,
}: {
  stores: readonly StoreSummary[];
  user: { name: string; email: string };
  organization: string;
  children: ReactNode;
}) {
  return (
    <StoresProvider stores={stores}>
    <div className="min-h-dvh">
      <Suspense>
        <Sidebar />
      </Suspense>
      <div className="lg:pl-60">
        <Suspense>
          <Header stores={stores} user={user} organization={organization} />
        </Suspense>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
    </StoresProvider>
  );
}
