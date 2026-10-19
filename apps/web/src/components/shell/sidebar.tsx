"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NAV } from "./nav";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Carry report filters between report pages.
  const carry = new URLSearchParams();
  for (const k of ["store", "preset", "start", "end", "compare"]) {
    const v = sp.get(k);
    if (v) carry.set(k, v);
  }
  const qs = carry.toString();
  // Cost and settings pages are per store: carry only the store.
  const storeQs = sp.get("store") ? new URLSearchParams({ store: sp.get("store")! }).toString() : "";

  return (
    <nav aria-label="Main" className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const query = item.report ? qs : item.storeScoped ? storeQs : "";
              const href = (query ? `${item.href}?${query}` : item.href) as Route;
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                    {item.plannedPhase ? (
                      <span className="ml-auto rounded px-1.5 text-[10px] font-medium text-subtle ring-1 ring-border" title={`Planned for phase ${item.plannedPhase}`}>
                        P{item.plannedPhase}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b px-5">
        <Link href="/dashboard" aria-label="ProfitLens home">
          <Logo />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
      <div className="border-t px-5 py-3 text-[11px] leading-snug text-subtle">
        Management reporting — operational estimates, not accounting statements.
      </div>
    </aside>
  );
}
