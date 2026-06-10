/**
 * White-label theming seam. Unlike the admin web app (which themes AFTER login
 * via GET /tenants/branding), the resident app themes PRE-auth: the resident
 * types a PG slug and we fetch the public GET /branding/:slug. The login screen
 * calls `useTheme().setAccent(hex)` after that fetch; ThemeProvider repaints the
 * `--brand*` CSS variables (see components/theme-provider.tsx + tailwind.config).
 *
 * The tailwind.config `brand` palette resolves to these CSS vars; global.css
 * holds the teal defaults so the app is themed before any slug is entered.
 */
export const DEFAULT_BRAND = '#0d9488';

/** Pick black or white foreground for legibility on a hex background. */
export function readableForeground(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

/** The full set of `--brand*` CSS variables, derived from one accent hex. */
export type BrandPalette = Record<`--${string}`, string>;

/**
 * Derive the brand palette from a single accent hex (mirrors the design
 * prototype's color-mix tints): soft/softer/line are the accent mixed toward
 * white, deep is the accent mixed toward black.
 */
export function brandPalette(accent: string): BrandPalette {
  return {
    '--brand': accent,
    '--brand-foreground': readableForeground(accent),
    '--brand-soft': mix(accent, '#ffffff', 0.12),
    '--brand-softer': mix(accent, '#ffffff', 0.22),
    '--brand-line': mix(accent, '#ffffff', 0.4),
    '--brand-deep': mix(accent, '#000000', 0.88),
  };
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Mix `ratio` of `color` with `(1-ratio)` of `toward`. */
function mix(color: string, toward: string, ratio: number): string {
  const a = parseHex(color);
  const b = parseHex(toward);
  const ch = (x: number, y: number) =>
    Math.round(x * ratio + y * (1 - ratio))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}
