"use client";

import type { StoreSummary } from "@profitlens/core";
import { Check, ChevronsUpDown, LogOut, Menu, Monitor, Moon, Store, Sun, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { useReportParams } from "@/lib/use-report-params";
import { Logo } from "./logo";
import { SidebarNav } from "./sidebar";

function StoreSwitcher({ stores }: { stores: readonly StoreSummary[] }) {
  const [params, update] = useReportParams();
  const current = stores.find((s) => s.id === params.store) ?? stores[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 max-w-[20rem] justify-between gap-2 px-2.5" aria-label="Switch store">
          <Store className="text-muted-foreground" />
          <span className="truncate">{current?.name ?? "No store"}</span>
          {current?.isDemo ? <Badge variant="demo" className="hidden sm:inline-flex">Demo</Badge> : null}
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Stores</DropdownMenuLabel>
        {stores.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => update({ store: s.id })}>
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-xs text-subtle">{s.currency}</span>
            {s.id === current?.id ? <Check className="text-primary" /> : <span className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings/stores">Manage stores & integrations</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setTheme(o.value)}>
            <o.icon /> {o.label}
            {theme === o.value ? <Check className="ml-auto text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ name, email, organization }: { name: string; email: string; organization: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserRound />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel className="text-foreground">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate font-normal text-muted-foreground">{email}</span>
          <span className="mt-1 block truncate text-xs font-normal text-subtle">{organization}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({
  stores,
  user,
  organization,
}: {
  stores: readonly StoreSummary[];
  user: { name: string; email: string };
  organization: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur lg:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" heading={<Logo />} className="w-72 sm:max-w-72">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <StoreSwitcher stores={stores} />
      <div className="ml-auto flex items-center gap-1">
        <ThemeMenu />
        <UserMenu name={user.name} email={user.email} organization={organization} />
      </div>
    </header>
  );
}
