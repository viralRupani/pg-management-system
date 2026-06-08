import type { AuthTokens } from "@pg/shared";
import { ApiError, type ClientConfig, type Query } from "./types";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOpts {
  body?: unknown;
  query?: Query;
  /** Attach the access token + run the refresh-on-401 dance. Default true. */
  auth?: boolean;
}

/**
 * Core HTTP layer: auth header injection, JSON (de)serialization, typed errors,
 * and a single-flight refresh-on-401 retry. All resource methods funnel through
 * `request`.
 */
export class Http {
  /** Held in-flight refresh so concurrent 401s share one refresh, not a stampede. */
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly cfg: ClientConfig) {}

  get<T>(path: string, opts: Omit<RequestOpts, "body"> = {}): Promise<T> {
    return this.request<T>("GET", path, opts);
  }
  post<T>(path: string, body?: unknown, opts: RequestOpts = {}): Promise<T> {
    return this.request<T>("POST", path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts: RequestOpts = {}): Promise<T> {
    return this.request<T>("PATCH", path, { ...opts, body });
  }
  del<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  private async request<T>(
    method: Method,
    path: string,
    opts: RequestOpts,
  ): Promise<T> {
    const auth = opts.auth ?? true;
    const url = this.buildUrl(path, opts.query);

    let res = await this.fetch(method, url, opts.body, auth);

    if (res.status === 401 && auth) {
      const refreshed = await this.ensureRefreshed();
      if (refreshed) {
        res = await this.fetch(method, url, opts.body, true);
      }
      if (res.status === 401) {
        this.cfg.tokens.clear();
        this.cfg.onUnauthorized?.();
      }
    }

    return this.parse<T>(res);
  }

  private async fetch(
    method: Method,
    url: string,
    body: unknown,
    auth: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const token = this.cfg.tokens.getAccess();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Single-flight: many 401s collapse into one refresh round-trip. */
  private ensureRefreshed(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.cfg.tokens.getRefresh();
    if (!refreshToken) return false;
    const res = await fetch(`${this.cfg.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      this.cfg.tokens.clear();
      return false;
    }
    const tokens = (await res.json()) as AuthTokens;
    this.cfg.tokens.set(tokens);
    return true;
  }

  private buildUrl(path: string, query?: Query): string {
    let url = `${this.cfg.baseUrl}${path}`;
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) qs.append(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    return url;
  }

  private async parse<T>(res: Response): Promise<T> {
    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const message =
        (data && typeof data === "object" && "message" in data
          ? String((data as { message: unknown }).message)
          : res.statusText) || `Request failed (${res.status})`;
      throw new ApiError(res.status, message, data);
    }
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
