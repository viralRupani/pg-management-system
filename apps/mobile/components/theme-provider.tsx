import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import { vars } from 'nativewind';

import {
  getPersistedAccent,
  getPersistedScheme,
  setPersistedAccent,
  setPersistedScheme,
} from '@/lib/api';
import {
  DEFAULT_BRAND,
  resolveTokens,
  themeVars,
  type Scheme,
  type SchemePreference,
  type Tokens,
} from '@/lib/tokens';

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
  /** Flat JS colors for imperative use (icons, tints, tab bar, placeholders). */
  tokens: Tokens;
  /**
   * The memoized `vars()` style carrying the FULL token set. RN Modals portal
   * outside the root View tree, so every Modal root (Sheet, toasts-in-modals,
   * any new overlay) must re-apply this style — vars don't cascade into them.
   */
  varsStyle: ReturnType<typeof vars>;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: DEFAULT_BRAND,
  setAccent: () => {},
  schemePreference: 'system',
  setSchemePreference: () => {},
  scheme: 'light',
  tokens: resolveTokens('light', DEFAULT_BRAND),
  varsStyle: vars(themeVars('light', DEFAULT_BRAND)),
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Flat JS color tokens for the current scheme + accent. */
export function useTokens(): Tokens {
  return useContext(ThemeContext).tokens;
}

/** The full CSS-var style — re-apply on every Modal root (they portal out of the tree). */
export function useThemeVars(): ReturnType<typeof vars> {
  return useContext(ThemeContext).varsStyle;
}

function isSchemePreference(v: string | null): v is SchemePreference {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Holds the white-label accent + light/dark preference and applies the merged
 * token set as CSS variables on a root View (NativeWind `vars()`), so every
 * tokenized class (`bg-brand`, `text-ink`, `bg-surface`, …) repaints when the
 * PG's accent or the color scheme changes. Also owns the StatusBar style and
 * paints the page background explicitly (kills white flashes in dark mode).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seed from persisted values (hydrated before render) so a cold start keeps
  // the PG's brand + the user's scheme instead of flashing defaults.
  const [accent, setAccentState] = useState(() => getPersistedAccent() ?? DEFAULT_BRAND);
  const [schemePreference, setSchemePreferenceState] = useState<SchemePreference>(() => {
    const persisted = getPersistedScheme();
    return isSchemePreference(persisted) ? persisted : 'system';
  });

  const systemScheme = useColorScheme();
  const scheme: Scheme =
    schemePreference === 'system' ? (systemScheme ?? 'light') : schemePreference;

  const setAccent = useCallback((hex: string) => {
    setAccentState(hex);
    setPersistedAccent(hex);
  }, []);
  const setSchemePreference = useCallback((preference: SchemePreference) => {
    setSchemePreferenceState(preference);
    setPersistedScheme(preference);
  }, []);

  const tokens = useMemo(() => resolveTokens(scheme, accent), [scheme, accent]);
  const varsStyle = useMemo(() => vars(themeVars(scheme, accent)), [scheme, accent]);
  const value = useMemo(
    () => ({ accent, setAccent, schemePreference, setSchemePreference, scheme, tokens, varsStyle }),
    [accent, setAccent, schemePreference, setSchemePreference, scheme, tokens, varsStyle],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[varsStyle, { flex: 1, backgroundColor: tokens.page }]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
