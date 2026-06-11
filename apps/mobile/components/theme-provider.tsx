import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';

import { getPersistedAccent, setPersistedAccent } from '@/lib/api';
import { DEFAULT_BRAND, brandPalette } from '@/lib/theme';

interface ThemeContextValue {
  accent: string;
  /** Repaint the brand palette (called after GET /branding/:slug resolves). */
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: DEFAULT_BRAND,
  setAccent: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Holds the white-label accent and applies it as `--brand*` CSS variables on a
 * root View (NativeWind `vars()`), so every `bg-brand` / `text-brand-deep` below
 * repaints when a PG's accent is known. Defaults to teal until a slug resolves.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seed from the persisted accent (hydrated before render) so a cold start with
  // a saved session keeps the PG's brand instead of flashing the teal default.
  const [accent, setAccentState] = useState(() => getPersistedAccent() ?? DEFAULT_BRAND);
  const setAccent = useCallback((hex: string) => {
    setAccentState(hex);
    setPersistedAccent(hex);
  }, []);
  const style = useMemo(() => vars(brandPalette(accent)), [accent]);
  const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={style} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
