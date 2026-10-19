"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

/** `next` is an already-validated internal path (see safeNext); `email` pre-fills the field (e.g. from an invitation). */
export function AuthForm({ mode, next = null, email: defaultEmail }: { mode: "login" | "signup"; next?: string | null; email?: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(form.get("name") ?? "").trim() })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.replace((next ?? "/dashboard") as Route);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-lg font-semibold">{mode === "signup" ? "Create your account" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup" ? "A private workspace is created for you." : "Welcome back."}
        </p>
      </div>
      {mode === "signup" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={defaultEmail} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={10}
          aria-describedby={mode === "signup" ? "password-hint" : undefined}
        />
        {mode === "signup" ? (
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 10 characters.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-md bg-negative-soft px-3 py-2 text-sm text-negative">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? (
          <>
            Already have an account? <Link className="font-medium text-primary hover:underline" href={(next ? `/login?next=${encodeURIComponent(next)}` : "/login") as Route}>Sign in</Link>
          </>
        ) : (
          <>
            New to ProfitLens? <Link className="font-medium text-primary hover:underline" href={(next ? `/signup?next=${encodeURIComponent(next)}` : "/signup") as Route}>Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
