import { useQueryClient } from '@tanstack/react-query';
import type { AuthTokens, JwtPayload } from '@pg/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { currentUser, onUnauthorized, tokenStore } from '@/lib/api';

interface AuthContextValue {
  /** Decoded JWT of the signed-in resident, or null. UI/routing only. */
  user: JwtPayload | null;
  isAuthenticated: boolean;
  /** Persist tokens after OTP verify and flip the gate to the app. */
  signIn: (tokens: AuthTokens) => void;
  /** Clear tokens + cached queries and return to the login flow. */
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/**
 * Session state over the SecureStore-backed token store (lib/api.ts). Tokens
 * must already be hydrated (RootLayout awaits hydrateTokens before mounting), so
 * the initial user is read synchronously. Subscribes to the client's
 * unauthorized event so a failed refresh drops the user back to login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<JwtPayload | null>(() => currentUser());

  const signIn = useCallback((tokens: AuthTokens) => {
    tokenStore.set(tokens);
    setUser(currentUser());
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, signIn, signOut }),
    [user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
