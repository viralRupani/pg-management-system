/** @type {import('tailwindcss').Config} */
// NativeWind v4 is built on Tailwind CSS v3 (the admin web app uses Tailwind v4
// with @theme — different surface, deliberately).
//
// The `brand` palette is white-label: it resolves to CSS variables whose
// defaults live in global.css (:root) and which ThemeProvider repaints at
// runtime from GET /branding/:slug (lib/theme.ts derives the soft/deep tints
// from a single accent hex). Status + neutral tokens are FIXED (never themed) —
// they carry semantic meaning (amber=pending, green=ok, red=bad, blue=in-flight)
// and mirror the design prototype in apps/mobile/design.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // White-label accent (repaints at runtime via CSS vars).
        brand: {
          DEFAULT: 'var(--brand)',
          foreground: 'var(--brand-foreground)',
          soft: 'var(--brand-soft)', // ~12% tint — soft fills
          softer: 'var(--brand-softer)', // ~20% tint — pressed chips
          line: 'var(--brand-line)', // ~30% tint — borders
          deep: 'var(--brand-deep)', // darkened — icons on soft
        },
        // Neutrals (design prototype scale).
        ink: '#111827',
        ink2: '#6b7280',
        ink3: '#9ca3af',
        ink4: '#c7ccd4',
        surface: '#ffffff',
        surface2: '#f8fafc',
        page: '#f3f4f6',
        line: '#e9ebef',
        line2: '#f1f2f5',
        // Fixed semantic status palettes (text / bg / dot).
        amber: { DEFAULT: '#b45309', bg: '#fff7ed', dot: '#f59e0b' },
        success: { DEFAULT: '#15803d', bg: '#ecfdf3', dot: '#22c55e' },
        danger: { DEFAULT: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
        info: { DEFAULT: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
      },
      borderRadius: {
        btn: '12px',
        card: '18px',
        sheet: '22px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
