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
      {/* First focusable element: lets keyboard users jump past the navigation (WCAG 2.4.1). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
      >
        Skip to main content
      </a>
      <Suspense>
        <Sidebar />
      </Suspense>
      <div className="lg:pl-60">
        <Suspense>
          <Header stores={stores} user={user} organization={organization} />
        </Suspense>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none lg:px-8">{children}</main>
      </div>
    </div>
    </StoresProvider>
  );
}
