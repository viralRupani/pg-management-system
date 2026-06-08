import { PgApiClient, type TokenStore } from "@pg/api-client";
import { type AuthTokens, type JwtPayload, UserRole } from "@pg/shared";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

const ACCESS_KEY = "pg_admin_access";
const REFRESH_KEY = "pg_admin_refresh";
// An owner's GLOBAL (no-PG) token, stashed so "Switch PG" can return to the
// chooser without re-login. The ACCESS_KEY/REFRESH_KEY pair always holds
// whichever token is currently active (global before a switch, PG-scoped after).
const OWNER_GLOBAL_ACCESS = "pg_owner_global_access";
const OWNER_GLOBAL_REFRESH = "pg_owner_global_refresh";

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
  clearStashedGlobalTokens();
}

export function currentUser(): JwtPayload | null {
  return decodeToken(tokenStore.getAccess());
}

/** Stash an owner's global token pair so a later "Switch PG" can restore it. */
export function stashGlobalTokens(t: AuthTokens): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OWNER_GLOBAL_ACCESS, t.accessToken);
  localStorage.setItem(OWNER_GLOBAL_REFRESH, t.refreshToken);
}

export function getStashedGlobalTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(OWNER_GLOBAL_ACCESS);
  const refreshToken = localStorage.getItem(OWNER_GLOBAL_REFRESH);
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export function clearStashedGlobalTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OWNER_GLOBAL_ACCESS);
  localStorage.removeItem(OWNER_GLOBAL_REFRESH);
}

/** An owner with no active PG (global token) must pick a PG before the dashboard. */
export function needsPgSelection(user: JwtPayload | null): boolean {
  return user?.role === UserRole.PG_OWNER && user.tenantId == null;
}

/** Where a freshly-authenticated user should land. */
export function landingPath(user: JwtPayload | null): string {
  if (!user) return "/login";
  return needsPgSelection(user) ? "/pgs" : "/dashboard";
}
