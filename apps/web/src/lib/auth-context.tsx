"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseBrowserClient } from "./supabase-browser";
import { getServerBaseUrl } from "./env";

interface AuthContextValue {
  role: "admin" | "user";
  roleLoading: boolean;
  refreshRole: () => Promise<void>;
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [roleLoading, setRoleLoading] = useState(true);
  const accessToken = session?.access_token;
  const refreshRole = useCallback(async () => {
    if (!accessToken) { setRole("user"); setRoleLoading(false); return; }
    setRoleLoading(true);
    try {
      const response = await fetch(`${getServerBaseUrl()}/api/access`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = response.ok ? await response.json() : null;
      setRole(data?.role === "admin" ? "admin" : "user");
    } catch { setRole("user"); }
    finally { setRoleLoading(false); }
  }, [accessToken]);
  useEffect(() => { void refreshRole(); }, [refreshRole]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole("user");
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, role, roleLoading, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
