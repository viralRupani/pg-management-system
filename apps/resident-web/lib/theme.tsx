"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_BRAND,
  resolveTokens,
  themeVars,
  type Scheme,
  type SchemePreference,
  type Tokens,
} from "@/lib/tokens";

export { DEFAULT_BRAND } from "@/lib/tokens";
export type { Scheme, SchemePreference } from "@/lib/tokens";

/**
 * White-label + light/dark theming (the web port of the mobile ThemeProvider).
 * Unlike the admin app (which themes AFTER login), the resident app themes
 * PRE-auth: the resident types a PG slug, the login screen fetches the public
 * GET /branding/:slug and calls `setAccent(hex)`. The provider resolves
 * (scheme, accent) → the full token var set (lib/tokens.ts) and writes it onto
 * document.documentElement.style, so every tokenized Tailwind class
 * (`bg-brand`, `text-ink`, `bg-surface`, …) repaints when either changes.
 *
 * Accent + scheme preference persist in localStorage; the inline <head> script
 * in app/layout.tsx replays the SAME derivation before first paint so a cold
 * start with a saved session never flashes teal-on-light.
 */

export const ACCENT_KEY = "pg_resident_accent";
export const SCHEME_KEY = "pg_resident_scheme";

function isSchemePreference(v: string | null): v is SchemePreference {
  return v === "system" || v === "light" || v === "dark";
}

function persistedAccent(): string {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  try {
    const hex = localStorage.getItem(ACCENT_KEY);
    return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

function persistedScheme(): SchemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(SCHEME_KEY);
    return isSchemePreference(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Forget the persisted accent on sign-out (it's per-PG; the scheme is not). */
export function clearPersistedAccent(): void {
  try {
    localStorage.removeItem(ACCENT_KEY);
  } catch {
    /* best-effort */
  }
}

interface ThemeContextValue {
  /** The tenant's white-label accent hex. */
  accent: string;
  /** Repaint the brand palette (called after GET /branding/:slug resolves). */
  setAccent: (hex: string) => void;
  /** User preference: follow the OS or force light/dark. */
  schemePreference: SchemePreference;
  setSchemePreference: (preference: SchemePreference) => void;
  /** The resolved scheme actually painting right now. */
  scheme: Scheme;
  /** Flat JS colors for imperative use (icon tints, inline styles). */
  tokens: Tokens;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: DEFAULT_BRAND,
  setAccent: () => {},
  schemePreference: "system",
  setSchemePreference: () => {},
  scheme: "light",
  tokens: resolveTokens("light", DEFAULT_BRAND),
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Flat JS color tokens for the current scheme + accent. */
export function useTokens(): Tokens {
  return useContext(ThemeContext).tokens;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initializers run at hydration time on the client (window exists), so a
  // cold start seeds from the persisted values instead of flashing defaults —
  // the vars are applied imperatively (not rendered), so no hydration mismatch.
  const [accent, setAccentState] = useState(persistedAccent);
  const [schemePreference, setSchemePreferenceState] =
    useState<SchemePreference>(persistedScheme);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const scheme: Scheme =
    schemePreference === "system"
      ? systemDark
        ? "dark"
        : "light"
      : schemePreference;

  const setAccent = useCallback((hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setAccentState(hex);
    try {
      localStorage.setItem(ACCENT_KEY, hex);
    } catch {
      /* best-effort */
    }
  }, []);

  const setSchemePreference = useCallback((preference: SchemePreference) => {
    setSchemePreferenceState(preference);
    try {
      localStorage.setItem(SCHEME_KEY, preference);
    } catch {
      /* best-effort */
    }
  }, []);

  // Paint the full var set on the root element whenever scheme/accent change.
  useEffect(() => {
    const style = document.documentElement.style;
    for (const [k, v] of Object.entries(themeVars(scheme, accent))) {
      style.setProperty(k, v);
    }
    // Native form controls / scrollbars follow the scheme too.
    style.colorScheme = scheme;
  }, [scheme, accent]);

  const tokens = useMemo(() => resolveTokens(scheme, accent), [scheme, accent]);
  const value = useMemo(
    () => ({
      accent,
      setAccent,
      schemePreference,
      setSchemePreference,
      scheme,
      tokens,
    }),
    [accent, setAccent, schemePreference, setSchemePreference, scheme, tokens],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
