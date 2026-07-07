import { PgApiClient, type TokenStore } from '@pg/api-client';
import type { AuthTokens, JwtPayload } from '@pg/shared';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has NO native backing on web (react-native-web), so calling
// it there throws "getValueWithKeyAsync is not a function". Use a small
// persistence shim: SecureStore on native, localStorage on web. Every call is
// wrapped so a storage hiccup degrades to in-memory-only, never a crash.
const isWeb = Platform.OS === 'web';

async function storageGet(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (isWeb) globalThis.localStorage?.setItem(key, value);
    else void SecureStore.setItemAsync(key, value);
  } catch {
    /* in-memory cache remains authoritative */
  }
}

function storageDelete(key: string): void {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(key);
    else void SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

// Phone reaches the API over the LAN, so this must be the Mac's LAN IP at dev
// time (NOT localhost) — set EXPO_PUBLIC_API_URL in .env. See apps/mobile/CLAUDE.md.
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

const ACCESS_KEY = 'pg_resident_access';
const REFRESH_KEY = 'pg_resident_refresh';
const ACCENT_KEY = 'pg_resident_accent';
const SCHEME_KEY = 'pg_resident_scheme';

// SecureStore is async, but @pg/api-client's TokenStore is synchronous (the admin
// app backs it with localStorage). We mirror the tokens in memory so reads are
// sync, persist to SecureStore in the background, and hydrate once at startup.
let cache: { access: string | null; refresh: string | null } = {
  access: null,
  refresh: null,
};

// The white-label accent is themed pre-auth on the slug screen, but a cold start
// with a persisted token bounces straight past it — so persist the accent too and
// re-apply on startup, else the palette falls back to the DEFAULT_BRAND default.
let accentCache: string | null = null;

// Light/dark preference ('system' | 'light' | 'dark') — a device preference,
// deliberately NOT cleared on logout (unlike the accent, it isn't per-PG).
let schemeCache: string | null = null;

/** Load persisted tokens + accent + scheme into the in-memory cache. Call once before gating. */
export async function hydrateTokens(): Promise<void> {
  const [access, refresh, accent, scheme] = await Promise.all([
    storageGet(ACCESS_KEY),
    storageGet(REFRESH_KEY),
    storageGet(ACCENT_KEY),
    storageGet(SCHEME_KEY),
  ]);
  cache = { access, refresh };
  accentCache = accent;
  schemeCache = scheme;
}

/** The persisted brand accent hex, or null if none themed yet (sync read). */
export function getPersistedAccent(): string | null {
  return accentCache;
}

/** Persist the brand accent so it survives a cold start. */
export function setPersistedAccent(hex: string): void {
  accentCache = hex;
  storageSet(ACCENT_KEY, hex);
}

/** The persisted color-scheme preference, or null (sync read; validated by ThemeProvider). */
export function getPersistedScheme(): string | null {
  return schemeCache;
}

/** Persist the color-scheme preference ('system' | 'light' | 'dark'). */
export function setPersistedScheme(preference: string): void {
  schemeCache = preference;
  storageSet(SCHEME_KEY, preference);
}

const secureTokenStore: TokenStore = {
  getAccess: () => cache.access,
  getRefresh: () => cache.refresh,
  set: (t: AuthTokens) => {
    cache = { access: t.accessToken, refresh: t.refreshToken };
    // Fire-and-forget; the cache is already authoritative for sync reads.
    storageSet(ACCESS_KEY, t.accessToken);
    storageSet(REFRESH_KEY, t.refreshToken);
  },
  clear: () => {
    cache = { access: null, refresh: null };
    accentCache = null;
    storageDelete(ACCESS_KEY);
    storageDelete(REFRESH_KEY);
    storageDelete(ACCENT_KEY);
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

// Listeners notified when auth becomes unrecoverable (refresh failed). The
// AuthProvider subscribes to flip the gate back to the login flow.
const unauthorizedListeners = new Set<() => void>();

/** Subscribe to unrecoverable-auth events. Returns an unsubscribe fn. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

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
