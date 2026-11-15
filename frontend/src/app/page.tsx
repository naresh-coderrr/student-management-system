"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPROVED_ACCOUNTS } from "@/lib/api";
import { useSession } from "@/components/session-provider";

export default function SignInPage() {
  const session = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "activate">("signin");
  const [email, setEmail] = useState<string>(APPROVED_ACCOUNTS[0]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") await session.signIn(email, password);
      else await session.activate(email, password);
      router.replace("/studio");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex flex-col justify-between bg-sidebar px-8 py-10 text-sidebar-foreground lg:px-14">
        <div>
          <p className="text-xs tracking-[0.22em] text-sidebar-primary uppercase">Registrar</p>
          <h1 className="font-display mt-4 max-w-md text-5xl leading-[1.05]">
            Student Management System
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-sidebar-foreground/80">
            Design the columns you need, keep every record in Supabase, and let the assistant
            prepare changes only after it shows you the current row and you enter your password.
          </p>
        </div>
        <ul className="mt-10 space-y-2 text-sm text-sidebar-foreground/85">
          {APPROVED_ACCOUNTS.map((account) => (
            <li key={account} className="rounded-lg bg-sidebar-accent/80 px-3 py-2">
              {account}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-display text-3xl">{mode === "signin" ? "Sign in" : "Set a password"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {mode === "signin"
                ? "Use one of the three approved accounts."
                : "First visit for this email. The password is stored with Supabase and used again whenever the assistant changes data."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Account</Label>
            <select
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              {APPROVED_ACCOUNTS.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10"
              required
              minLength={mode === "activate" ? 8 : 6}
            />
          </div>
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy ? "Checking…" : mode === "signin" ? "Sign in" : "Create this account"}
          </Button>
          <button
            type="button"
            className="text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "activate" : "signin")}
          >
            {mode === "signin" ? "First time on this email? Set a password" : "Already have a password? Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
