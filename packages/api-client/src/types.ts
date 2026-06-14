import type { AuthTokens } from "@pg/shared";

/**
 * Pluggable token persistence. The admin app backs this with localStorage; the
 * mobile app will back it with expo-secure-store. The client itself never
 * touches a storage API directly — that is what keeps it framework-agnostic.
 */
export interface TokenStore {
  getAccess(): string | null;
  getRefresh(): string | null;
  set(tokens: AuthTokens): void;
  clear(): void;
}

export interface ClientConfig {
  /** API base URL, no trailing slash (e.g. http://localhost:4000). */
  baseUrl: string;
  tokens: TokenStore;
  /**
   * Per-request timeout in ms. RN's fetch has NO timeout, so an unreachable host
   * (wrong LAN IP, API down) hangs forever and the UI spins indefinitely. Aborts
   * the request and throws a 0-status ApiError instead. Default 15000.
   */
  timeoutMs?: number;
  /**
   * Invoked when auth is unrecoverable (no refresh token, or refresh failed).
   * The UI should redirect to login. Called once per failed auth attempt.
   */
  onUnauthorized?: () => void;
}

/** Thrown for any non-2xx response. `body` is the parsed JSON error if present. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;
