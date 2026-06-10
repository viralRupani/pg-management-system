import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';

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
  const [accent, setAccent] = useState(DEFAULT_BRAND);
  const style = useMemo(() => vars(brandPalette(accent)), [accent]);
  const value = useMemo(() => ({ accent, setAccent }), [accent]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={style} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
