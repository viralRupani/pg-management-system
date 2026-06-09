/**
 * White-label theming seam. Unlike the admin web app (which themes AFTER login
 * via GET /tenants/branding), the resident app themes PRE-auth: the resident
 * types a PG slug and we fetch the public GET /branding/:slug. That wiring lands
 * with the login screen; for now this just holds the default accent so the rest
 * of the app can reference one source of truth.
 *
 * Runtime repaint in NativeWind is done with CSS variables (`vars()`); the
 * tailwind.config `brand` color is the static fallback used until a slug is set.
 */
export const DEFAULT_BRAND = '#0d9488';

/** Pick black or white foreground for legibility on a hex background. */
export function readableForeground(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}
