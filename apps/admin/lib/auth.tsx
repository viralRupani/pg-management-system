"use client";

import type { JwtPayload, TenantBranding } from "@pg/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, clearTokens, currentUser, setTokens } from "./api";
import { applyAccentColor } from "./theme";

interface AuthContextValue {
  user: JwtPayload | null;
  branding: TenantBranding | null;
  /** True until the initial token hydration completes (avoids flash of login). */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshBranding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBranding = useCallback(async () => {
    try {
      const b = await api.branding.mine();
      setBranding(b);
      applyAccentColor(b.accentColor);
    } catch {
      // Branding is cosmetic — never block the app on it.
    }
  }, []);

  // Hydrate from any persisted token on first mount.
  useEffect(() => {
    const u = currentUser();
    setUser(u);
    if (u) void loadBranding();
    setLoading(false);
  }, [loadBranding]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.auth.managerLogin({ email, password });
      setTokens(tokens);
      setUser(currentUser());
      await loadBranding();
    },
    [loadBranding],
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setBranding(null);
    if (typeof window !== "undefined") location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, branding, loading, login, logout, refreshBranding: loadBranding }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
