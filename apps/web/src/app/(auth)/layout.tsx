import type { ReactNode } from "react";
import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-subtle">
        Profit analytics for Shopify. Figures are management estimates, not accounting statements.
      </p>
    </div>
  );
}
