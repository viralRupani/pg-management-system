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
  /** The current owner/manager hasn't accepted the latest T&C version yet. */
  termsPending: boolean;
  /** True while the T&C status is being fetched (gates the guard, avoids flash). */
  tcLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Owner: enter one of their PGs (mints + persists a PG-scoped token). */
  switchPg: (tenantId: string) => Promise<void>;
  /** Owner: leave the active PG, restore the global token (→ PG chooser). */
  exitPg: () => void;
  refreshBranding: () => Promise<void>;
  /** Re-fetch T&C status (call after accepting to clear the gate). */
  refreshTerms: () => Promise<void>;
  /** Re-read the stored token and update the in-memory user (e.g. after a token swap). */
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [termsPending, setTermsPending] = useState(false);
  // Default FALSE: only an actual fetch sets it true. Logged-out users and
  // platform admins never fetch, so they must never be left spinning on it.
  const [tcLoading, setTcLoading] = useState(false);

  const loadBranding = useCallback(async () => {
    try {
      const b = await api.branding.mine();
      setBranding(b);
      applyAccentColor(b.accentColor);
    } catch {
      // Branding is cosmetic — never block the app on it.
    }
  }, []);

  /**
   * Fetch the T&C acceptance gate for a specific user. Kept SEPARATE from
   * loadBranding (which switchPg re-calls on the PG-scoped owner token, where the
   * owner's credential isn't addressable — re-gating would be wrong). Only
   * owners/managers have a gate; platform-admin + logged-out resolve immediately
   * to a clear state so the guard never hangs. Takes `u` explicitly to avoid a
   * stale-closure read of `user`.
   */
  const loadTermsStatus = useCallback(async (u: JwtPayload | null) => {
    if (
      !u ||
      (u.role !== UserRole.PG_OWNER && u.role !== UserRole.PG_MANAGER)
    ) {
      setTermsPending(false);
      setTcLoading(false);
      return;
    }
    setTcLoading(true);
    try {
      const s = await api.terms.status();
      setTermsPending(!s.accepted);
    } catch {
      // Fail open on any error — never trap a user behind a broken status call.
      setTermsPending(false);
    } finally {
      setTcLoading(false);
    }
  }, []);

  // Hydrate from any persisted token on first mount.
  useEffect(() => {
    const u = currentUser();
    setUser(u);
    // Branding needs a tenant context; skip for an owner who hasn't picked a PG.
    if (u && !needsPgSelection(u)) void loadBranding();
    // T&C gate is fetched for owners/managers regardless of PG selection (an
    // owner accepts on their global token). The synchronous setTcLoading(true)
    // inside batches with setLoading(false), so the guard sees tcLoading before
    // it could flash the dashboard.
    void loadTermsStatus(u);
    setLoading(false);
  }, [loadBranding, loadTermsStatus]);

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
      // Resolve the T&C gate (owners/managers only). The reactive route guards —
      // not the imperative post-login redirect, whose `termsPending` closure is
      // stale — are what actually enforce it.
      await loadTermsStatus(u);
    },
    [loadBranding, loadTermsStatus],
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
    const u = currentUser();
    setUser(u);
    setBranding(null);
    clearAccentColor();
    // Re-check T&C on the restored global token so returning to the chooser is a
    // real re-prompt point for a version published while the owner was inside a PG
    // (their credential is only addressable on the global token).
    void loadTermsStatus(u);
  }, [loadTermsStatus]);

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

  const refreshTerms = useCallback(
    () => loadTermsStatus(currentUser()),
    [loadTermsStatus],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        branding,
        loading,
        isOwner: user?.role === UserRole.PG_OWNER,
        termsPending,
        tcLoading,
        login,
        logout,
        switchPg,
        exitPg,
        refreshBranding: loadBranding,
        refreshTerms,
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
