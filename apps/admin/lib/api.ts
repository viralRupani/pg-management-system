import { PgApiClient, type TokenStore } from "@pg/api-client";
import type { AuthTokens, JwtPayload } from "@pg/shared";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

const ACCESS_KEY = "pg_admin_access";
const REFRESH_KEY = "pg_admin_refresh";

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

/** Decode (not verify) a JWT payload. The API is the trust boundary; the client
 * only reads role/tenant for routing + UI. Returns null if unparseable. */
export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** The shared API client singleton. onUnauthorized hard-redirects to login. */
export const api = new PgApiClient({
  baseUrl: API_BASE_URL,
  tokens: tokenStore,
  onUnauthorized: () => {
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = "/login";
    }
  },
});

export function setTokens(t: AuthTokens): void {
  tokenStore.set(t);
}

export function clearTokens(): void {
  tokenStore.clear();
}

export function currentUser(): JwtPayload | null {
  return decodeToken(tokenStore.getAccess());
}
