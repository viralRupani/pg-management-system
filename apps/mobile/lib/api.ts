import { PgApiClient, type TokenStore } from '@pg/api-client';
import type { AuthTokens, JwtPayload } from '@pg/shared';
import * as SecureStore from 'expo-secure-store';

// Phone reaches the API over the LAN, so this must be the Mac's LAN IP at dev
// time (NOT localhost) — set EXPO_PUBLIC_API_URL in .env. See apps/mobile/CLAUDE.md.
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

const ACCESS_KEY = 'pg_resident_access';
const REFRESH_KEY = 'pg_resident_refresh';

// SecureStore is async, but @pg/api-client's TokenStore is synchronous (the admin
// app backs it with localStorage). We mirror the tokens in memory so reads are
// sync, persist to SecureStore in the background, and hydrate once at startup.
let cache: { access: string | null; refresh: string | null } = {
  access: null,
  refresh: null,
};

/** Load persisted tokens into the in-memory cache. Call once before gating. */
export async function hydrateTokens(): Promise<void> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  cache = { access, refresh };
}

const secureTokenStore: TokenStore = {
  getAccess: () => cache.access,
  getRefresh: () => cache.refresh,
  set: (t: AuthTokens) => {
    cache = { access: t.accessToken, refresh: t.refreshToken };
    // Fire-and-forget; the cache is already authoritative for sync reads.
    void SecureStore.setItemAsync(ACCESS_KEY, t.accessToken);
    void SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken);
  },
  clear: () => {
    cache = { access: null, refresh: null };
    void SecureStore.deleteItemAsync(ACCESS_KEY);
    void SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export const tokenStore = secureTokenStore;

/**
 * Decode (not verify) a JWT payload — for routing/UI only. The API is the trust
 * boundary and re-verifies every request. Returns null if unparseable.
 */
export function decodeToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Where the next login should redirect on auth failure. Wired in step where the
 * auth gate lands; for now it just clears tokens (router not imported here). */
export const api = new PgApiClient({
  baseUrl: API_BASE_URL,
  tokens: tokenStore,
  onUnauthorized: () => {
    tokenStore.clear();
  },
});

export function currentUser(): JwtPayload | null {
  return decodeToken(tokenStore.getAccess());
}
