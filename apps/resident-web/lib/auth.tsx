"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { AuthTokens, JwtPayload } from "@pg/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { currentUser, onUnauthorized, tokenStore } from "@/lib/api";
import { clearAccentColor } from "@/lib/theme";

interface AuthContextValue {
  /** Decoded JWT of the signed-in resident, or null. UI/routing only. */
  user: JwtPayload | null;
  isAuthenticated: boolean;
  /** True until the initial token read completes (avoids a flash of login). */
  loading: boolean;
  /** Persist tokens after OTP verify and flip the gate to the app. */
  signIn: (tokens: AuthTokens) => void;
  /** Clear tokens + cached queries + accent and return to the login flow. */
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Session state over the localStorage-backed token store (lib/api.ts). The token
 * is read synchronously, but we still gate on `loading` for one tick so the
 * static-export first render (no window) doesn't flash the login screen.
 * Subscribes to the client's unauthorized event so a failed refresh drops the
 * resident back to login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(currentUser());
    setLoading(false);
  }, []);

  const signIn = useCallback((tokens: AuthTokens) => {
    tokenStore.set(tokens);
    setUser(currentUser());
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    clearAccentColor();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      loading,
      signIn,
      signOut,
    }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
