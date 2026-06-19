/**
 * White-label theming. Unlike the admin app (which themes AFTER login via
 * GET /tenants/branding), the resident app themes PRE-auth: the resident types a
 * PG slug, we fetch the public GET /branding/:slug, and paint the accent here.
 *
 * The whole `--brand*` family is derived from one accent hex (mirrors the mobile
 * app's brandPalette). We persist the accent so a cold start with a saved token
 * — which bounces past the slug screen — still repaints; the inline <head> script
 * in app/layout.tsx replays the SAME derivation before first paint (anti-flash).
 */

export const ACCENT_KEY = "pg_resident_accent";
export const DEFAULT_BRAND = "#0d9488";

/** Pick black or white foreground for legibility on a hex background. */
export function readableForeground(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

/** The full set of `--brand*` CSS variables, derived from one accent hex. */
export type BrandPalette = Record<string, string>;

/**
 * Derive the brand palette from a single accent hex: soft/softer/line are the
 * accent mixed toward white, deep is mixed toward black. (1:1 with the mobile
 * app's lib/theme.ts so the two surfaces theme identically.)
 */
export function brandPalette(accent: string): BrandPalette {
  return {
    "--brand": accent,
    "--brand-foreground": readableForeground(accent),
    "--brand-soft": mix(accent, "#ffffff", 0.12),
    "--brand-softer": mix(accent, "#ffffff", 0.22),
    "--brand-line": mix(accent, "#ffffff", 0.4),
    "--brand-deep": mix(accent, "#000000", 0.88),
  };
}

/** Paint + persist a tenant accent. Writes all six --brand* vars on :root. */
export function applyAccentColor(hex: string | null | undefined): void {
  if (typeof document === "undefined") return;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandPalette(hex))) {
    root.style.setProperty(k, v);
  }
  try {
    localStorage.setItem(ACCENT_KEY, hex);
  } catch {
    /* persistence is best-effort */
  }
}

/** Forget the persisted accent and reset to the teal default (on sign-out). */
export function clearAccentColor(): void {
  try {
    localStorage.removeItem(ACCENT_KEY);
  } catch {
    /* ignore */
  }
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const k of Object.keys(brandPalette(DEFAULT_BRAND))) {
    root.style.removeProperty(k);
  }
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
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
      .padStart(2, "0");
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}
