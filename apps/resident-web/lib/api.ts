import { PgApiClient, type TokenStore } from "@pg/api-client";
import type { AuthTokens, JwtPayload } from "@pg/shared";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

const ACCESS_KEY = "pg_resident_access";
const REFRESH_KEY = "pg_resident_refresh";

/** localStorage-backed token store. Guards against SSR/no-window (static export). */
const localTokenStore: TokenStore = {
  getAccess: () =>
    typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY),
  getRefresh: () =>
    typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY),
  set: (t: AuthTokens) => {
    localStorage.setItem(ACCESS_KEY, t.accessToken);
    localStorage.setItem(REFRESH_KEY, t.refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const tokenStore = localTokenStore;

/**
 * Decode (not verify) a JWT payload — for routing/UI only (e.g. own-message
 * detection in the complaint thread). The API is the trust boundary and
 * re-verifies every request. Returns null if unparseable.
 */
export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

// Listeners notified when auth becomes unrecoverable (refresh failed). The
// AuthProvider subscribes to flip the gate back to login; the route guard then
// redirects. (A SPA reacts to state rather than a hard location.href.)
const unauthorizedListeners = new Set<() => void>();

/** Subscribe to unrecoverable-auth events. Returns an unsubscribe fn. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** The shared API client singleton. On unrecoverable 401 it clears tokens and
 * notifies listeners (api-client already does single-flight refresh-on-401). */
export const api = new PgApiClient({
  baseUrl: API_BASE_URL,
  tokens: tokenStore,
  onUnauthorized: () => {
    tokenStore.clear();
    for (const l of unauthorizedListeners) l();
  },
});

export function currentUser(): JwtPayload | null {
  return decodeToken(tokenStore.getAccess());
}
