"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, readToken, readUser, saveSession, type SessionUser, api } from "@/lib/api";

type SessionContextValue = {
  user: SessionUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  activate: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readUser();
    const token = readToken();
    if (!stored || !token) {
      setReady(true);
      return;
    }
    setUser(stored);
    api<SessionUser>("/api/auth/me")
      .then((fresh) => {
        saveSession(token, fresh);
        setUser(fresh);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      ready,
      async signIn(email, password) {
        const result = await api<{ user: SessionUser; session: { access_token: string } }>(
          "/api/auth/login",
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
        saveSession(result.session.access_token, result.user);
        setUser(result.user);
      },
      async activate(email, password) {
        const result = await api<{ user: SessionUser; session: { access_token: string } }>(
          "/api/auth/activate",
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
        saveSession(result.session.access_token, result.user);
        setUser(result.user);
      },
      signOut() {
        clearSession();
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

export function useRequireSession() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.ready && !session.user) router.replace("/");
  }, [session.ready, session.user, router]);
  return session;
}
