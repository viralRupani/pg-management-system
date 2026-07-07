/** @type {import('tailwindcss').Config} */
// NativeWind v4 is built on Tailwind CSS v3 (the admin web app uses Tailwind v4
// with @theme — different surface, deliberately).
//
// EVERY color resolves to a CSS variable — one theming mechanism for both the
// white-label brand accent AND light/dark mode. lib/tokens.ts holds the actual
// hex values per scheme; ThemeProvider applies the full var set at runtime via
// NativeWind vars() (and Sheet re-applies it on Modal roots, which portal
// outside the root tree). global.css seeds the light defaults pre-provider.
//
// NOTE: Tailwind alpha modifiers (e.g. `border-danger/30`) do NOT work on
// hex-valued vars — use the explicit `-dim`/`-line` tokens instead.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // White-label accent (repaints at runtime; dark-scheme-aware).
        brand: {
          DEFAULT: 'var(--brand)',
          foreground: 'var(--brand-foreground)',
          'foreground-dim': 'var(--brand-foreground-dim)', // muted text on brand fills
          soft: 'var(--brand-soft)', // soft fills
          softer: 'var(--brand-softer)', // pressed chips
          line: 'var(--brand-line)', // borders
          deep: 'var(--brand-deep)', // icons/text on soft (lightened in dark)
        },
        // Neutrals (scheme-swapped by ThemeProvider).
        ink: 'var(--ink)',
        ink2: 'var(--ink2)',
        ink3: 'var(--ink3)',
        ink4: 'var(--ink4)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        page: 'var(--page)',
        line: 'var(--line)',
        line2: 'var(--line2)',
        // Semantic status palettes (text / bg / dot / line) — fixed per scheme,
        // never tenant-themed.
        amber: {
          DEFAULT: 'var(--amber)',
          bg: 'var(--amber-bg)',
          dot: 'var(--amber-dot)',
          line: 'var(--amber-line)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
          dot: 'var(--success-dot)',
          line: 'var(--success-line)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          bg: 'var(--danger-bg)',
          dot: 'var(--danger-dot)',
          line: 'var(--danger-line)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
          dot: 'var(--info-dot)',
          line: 'var(--info-line)',
        },
      },
      borderRadius: {
        btn: '14px',
        field: '14px',
        tile: '16px',
        card: '20px',
        sheet: '28px',
        pill: '999px',
      },
      fontFamily: {
        // Inter static weights (loaded in app/_layout.tsx). RN selects fonts by
        // family name, not weight — these aliases are for raw <Text> spots;
        // AppText (components/ui/text.tsx) is the preferred surface.
        regular: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
        heavy: ['Inter_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
