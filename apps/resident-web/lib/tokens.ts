/**
 * Design-token source of truth — every color in the app lives here, per scheme.
 *
 * Ported 1:1 from apps/mobile/lib/tokens.ts — keep the two files identical so
 * both surfaces theme the same. Three consumers:
 *   1. `themeVars(scheme, accent)` → the CSS-variable set ThemeProvider
 *      (lib/theme.tsx) writes onto document.documentElement.style.
 *   2. `resolveTokens(scheme, accent)` → a flat JS object for anything that
 *      needs a real color value (imperative icon tints etc.).
 *   3. app/globals.css maps class names (`text-ink`, `bg-amber-bg`, …) to these
 *      vars via Tailwind v4 `@theme inline`, and seeds the light defaults
 *      pre-provider; app/layout.tsx embeds NEUTRALS/SEMANTICS into the inline
 *      anti-flash script so a cold start paints the right scheme + accent.
 *
 * The white-label brand palette is derived from ONE accent hex (from
 * GET /branding/:slug) — light mixes toward white/black like the original
 * design prototype; dark mixes toward the dark surfaces and contrast-lifts the
 * accent so arbitrary tenant colors stay legible on a near-black page.
 * Semantic status colors (amber/success/danger/info) are fixed per scheme and
 * never themed.
 */

export type Scheme = 'light' | 'dark';
export type SchemePreference = 'system' | Scheme;

export const DEFAULT_BRAND = '#0d9488';

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export const NEUTRALS: Record<Scheme, Record<string, string>> = {
  light: {
    page: '#f5f6f8',
    surface: '#ffffff',
    surface2: '#eef0f3',
    line: '#e6e8ec',
    line2: '#f0f1f4',
    ink: '#16181d',
    ink2: '#5c6470',
    ink3: '#9aa1ab',
    ink4: '#c9ced6',
  },
  dark: {
    page: '#0e1013',
    surface: '#171a1f',
    surface2: '#1e2228',
    line: '#272c33',
    line2: '#1f242a',
    ink: '#f2f4f7',
    ink2: '#9aa3af',
    ink3: '#6a7280',
    ink4: '#3c434c',
  },
};

type SemanticSet = { text: string; bg: string; dot: string; line: string };

export const SEMANTICS: Record<
  Scheme,
  Record<'amber' | 'success' | 'danger' | 'info', SemanticSet>
> = {
  light: {
    amber: { text: '#b45309', bg: '#fef3e2', dot: '#f59e0b', line: '#f6d7a6' },
    success: { text: '#15803d', bg: '#e9f9ef', dot: '#22c55e', line: '#b8e8c9' },
    danger: { text: '#b91c1c', bg: '#fdeeee', dot: '#ef4444', line: '#f4c2c2' },
    info: { text: '#1d4ed8', bg: '#e9f1fe', dot: '#3b82f6', line: '#bdd4fa' },
  },
  dark: {
    amber: { text: '#fbbf24', bg: '#2b2109', dot: '#f59e0b', line: '#4a3a12' },
    success: { text: '#4ade80', bg: '#0c2818', dot: '#22c55e', line: '#14532d' },
    danger: { text: '#f87171', bg: '#2c1314', dot: '#ef4444', line: '#542426' },
    info: { text: '#93b4fd', bg: '#131f38', dot: '#3b82f6', line: '#1e3a6e' },
  },
};

// ---------------------------------------------------------------------------
// Color math
// ---------------------------------------------------------------------------

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Mix `ratio` of `color` with `(1-ratio)` of `toward`. */
export function mix(color: string, toward: string, ratio: number): string {
  const a = parseHex(color);
  const b = parseHex(toward);
  const ch = (x: number, y: number) =>
    Math.round(x * ratio + y * (1 - ratio))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}

/** Pick black or white foreground for legibility on a hex background. */
export function readableForeground(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

/** WCAG relative luminance (linearized sRGB). */
function relLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hexes (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Lift a (possibly very dark) tenant accent toward white until it reads on the
 * dark page — arbitrary brand hexes must stay usable as text/fills in dark mode.
 */
function liftForDark(accent: string, against: string, min = 4.5): string {
  let c = accent;
  for (let i = 0; i < 12 && contrastRatio(c, against) < min; i++) {
    c = mix(c, '#ffffff', 0.88);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Brand palette (white-label, scheme-aware)
// ---------------------------------------------------------------------------

export type BrandPalette = Record<`--${string}`, string>;

/**
 * Derive the full `--brand*` variable set from one accent hex.
 * Light mirrors the original design-prototype color-mix tints exactly.
 * Dark: the accent is contrast-lifted, soft/softer/line mix toward the dark
 * surface, and `--brand-deep` FLIPS to a lightened brand ink (it's used as
 * icon/text-on-soft, which needs to get lighter — not darker — on dark).
 */
export function brandPalette(accent: string, scheme: Scheme = 'light'): BrandPalette {
  if (scheme === 'dark') {
    const dark = NEUTRALS.dark;
    const brand = liftForDark(accent, dark.page);
    const foreground = readableForeground(brand);
    return {
      '--brand': brand,
      '--brand-foreground': foreground,
      '--brand-foreground-dim': mix(foreground, brand, 0.75),
      '--brand-soft': mix(brand, dark.surface, 0.16),
      '--brand-softer': mix(brand, dark.surface, 0.24),
      '--brand-line': mix(brand, dark.surface, 0.38),
      '--brand-deep': mix(brand, '#ffffff', 0.65),
    };
  }
  const foreground = readableForeground(accent);
  return {
    '--brand': accent,
    '--brand-foreground': foreground,
    '--brand-foreground-dim': mix(foreground, accent, 0.75),
    '--brand-soft': mix(accent, '#ffffff', 0.12),
    '--brand-softer': mix(accent, '#ffffff', 0.22),
    '--brand-line': mix(accent, '#ffffff', 0.4),
    '--brand-deep': mix(accent, '#000000', 0.88),
  };
}

// ---------------------------------------------------------------------------
// Var set + resolved JS tokens
// ---------------------------------------------------------------------------

/** The complete CSS-variable set for a scheme+accent — feeds NativeWind `vars()`. */
export function themeVars(scheme: Scheme, accent: string): Record<`--${string}`, string> {
  const n = NEUTRALS[scheme];
  const s = SEMANTICS[scheme];
  return {
    '--page': n.page,
    '--surface': n.surface,
    '--surface2': n.surface2,
    '--line': n.line,
    '--line2': n.line2,
    '--ink': n.ink,
    '--ink2': n.ink2,
    '--ink3': n.ink3,
    '--ink4': n.ink4,
    '--amber': s.amber.text,
    '--amber-bg': s.amber.bg,
    '--amber-dot': s.amber.dot,
    '--amber-line': s.amber.line,
    '--success': s.success.text,
    '--success-bg': s.success.bg,
    '--success-dot': s.success.dot,
    '--success-line': s.success.line,
    '--danger': s.danger.text,
    '--danger-bg': s.danger.bg,
    '--danger-dot': s.danger.dot,
    '--danger-line': s.danger.line,
    '--info': s.info.text,
    '--info-bg': s.info.bg,
    '--info-dot': s.info.dot,
    '--info-line': s.info.line,
    ...brandPalette(accent, scheme),
  };
}

/** Flat JS color values for imperative use (icons, tints, StatusBar, tab bar). */
export interface Tokens {
  scheme: Scheme;
  /** StatusBar style for screens whose header is a bg-brand surface. */
  statusBarOnBrand: 'light' | 'dark';
  page: string;
  surface: string;
  surface2: string;
  line: string;
  line2: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  brand: string;
  brandForeground: string;
  brandForegroundDim: string;
  brandSoft: string;
  brandSofter: string;
  brandLine: string;
  brandDeep: string;
  amber: string;
  amberBg: string;
  amberDot: string;
  success: string;
  successBg: string;
  successDot: string;
  danger: string;
  dangerBg: string;
  dangerDot: string;
  info: string;
  infoBg: string;
  infoDot: string;
}

export function resolveTokens(scheme: Scheme, accent: string): Tokens {
  const n = NEUTRALS[scheme];
  const s = SEMANTICS[scheme];
  const b = brandPalette(accent, scheme);
  return {
    scheme,
    statusBarOnBrand: b['--brand-foreground'] === '#ffffff' ? 'light' : 'dark',
    page: n.page,
    surface: n.surface,
    surface2: n.surface2,
    line: n.line,
    line2: n.line2,
    ink: n.ink,
    ink2: n.ink2,
    ink3: n.ink3,
    ink4: n.ink4,
    brand: b['--brand'],
    brandForeground: b['--brand-foreground'],
    brandForegroundDim: b['--brand-foreground-dim'],
    brandSoft: b['--brand-soft'],
    brandSofter: b['--brand-softer'],
    brandLine: b['--brand-line'],
    brandDeep: b['--brand-deep'],
    amber: s.amber.text,
    amberBg: s.amber.bg,
    amberDot: s.amber.dot,
    success: s.success.text,
    successBg: s.success.bg,
    successDot: s.success.dot,
    danger: s.danger.text,
    dangerBg: s.danger.bg,
    dangerDot: s.danger.dot,
    info: s.info.text,
    infoBg: s.info.bg,
    infoDot: s.info.dot,
  };
}
