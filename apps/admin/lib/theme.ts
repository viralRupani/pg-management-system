/**
 * White-label theming. The manager login screen is neutral (we don't know the
 * tenant pre-auth); after login we read GET /tenants/branding and paint the
 * accent color into the --brand CSS variable, so the whole shell takes on the
 * PG's colour. RLS isolates data; this is the "feels bespoke" layer.
 */

export const BRAND_COLOR_KEY = "pg_brand_color";

/** Pick black or white text for legibility on a hex background. */
function readableForeground(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance (sRGB approximation).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export function applyAccentColor(hex: string | null | undefined): void {
  if (typeof document === "undefined") return;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const root = document.documentElement;
  root.style.setProperty("--brand", hex);
  root.style.setProperty("--brand-foreground", readableForeground(hex));
  localStorage.setItem(BRAND_COLOR_KEY, hex);
}

export function clearAccentColor(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(BRAND_COLOR_KEY);
  }
}
