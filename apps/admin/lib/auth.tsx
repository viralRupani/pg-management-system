"use client";

import { type JwtPayload, type TenantBranding, UserRole } from "@pg/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  api,
  clearTokens,
  currentUser,
  getStashedGlobalTokens,
  needsPgSelection,
  setTokens,
  stashGlobalTokens,
} from "./api";
import { applyAccentColor, clearAccentColor } from "./theme";

interface AuthContextValue {
  user: JwtPayload | null;
  branding: TenantBranding | null;
  /** True until the initial token hydration completes (avoids flash of login). */
  loading: boolean;
  /** A PG owner (cross-tenant). May or may not have an active PG selected. */
  isOwner: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Owner: enter one of their PGs (mints + persists a PG-scoped token). */
  switchPg: (tenantId: string) => Promise<void>;
  /** Owner: leave the active PG, restore the global token (→ PG chooser). */
  exitPg: () => void;
  refreshBranding: () => Promise<void>;
  /** Re-read the stored token and update the in-memory user (e.g. after a token swap). */
  refreshUser: () => void;
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
    // Branding needs a tenant context; skip for an owner who hasn't picked a PG.
    if (u && !needsPgSelection(u)) void loadBranding();
    setLoading(false);
  }, [loadBranding]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api.auth.managerLogin({ email, password });
      setTokens(tokens);
      const u = currentUser();
      setUser(u);
      if (needsPgSelection(u)) {
        // Owner global token: remember it so "Switch PG" can return here; no
        // branding yet (no active PG). The chooser is where they go next.
        stashGlobalTokens(tokens);
      } else {
        await loadBranding();
      }
    },
    [loadBranding],
  );

  const switchPg = useCallback(
    async (tenantId: string) => {
      const tokens = await api.owner.pgs.switch(tenantId);
      setTokens(tokens); // active token is now PG-scoped
      setUser(currentUser());
      await loadBranding();
    },
    [loadBranding],
  );

  const exitPg = useCallback(() => {
    const global = getStashedGlobalTokens();
    if (global) setTokens(global); // restore the global token as active
    setUser(currentUser());
    setBranding(null);
    clearAccentColor();
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    clearAccentColor();
    setUser(null);
    setBranding(null);
    if (typeof window !== "undefined") location.href = "/login";
  }, []);

  const refreshUser = useCallback(() => {
    setUser(currentUser());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        branding,
        loading,
        isOwner: user?.role === UserRole.PG_OWNER,
        login,
        logout,
        switchPg,
        exitPg,
        refreshBranding: loadBranding,
        refreshUser,
      }}
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
