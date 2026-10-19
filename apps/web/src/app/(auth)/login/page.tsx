import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/safe-next";
import { getAppSession } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getAppSession()) redirect((next ?? "/dashboard") as Route);
  return <AuthForm mode="login" next={next} email={typeof sp.email === "string" ? sp.email.slice(0, 254) : undefined} />;
}
