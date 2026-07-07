/**
 * White-label theming seam. Unlike the admin web app (which themes AFTER login
 * via GET /tenants/branding), the resident app themes PRE-auth: the resident
 * types a PG slug and we fetch the public GET /branding/:slug. The login screen
 * calls `useTheme().setAccent(hex)` after that fetch; ThemeProvider repaints the
 * CSS variables (see components/theme-provider.tsx + tailwind.config).
 *
 * All color math + palettes now live in lib/tokens.ts (the design-token source
 * of truth, scheme-aware for dark mode). This module re-exports the brand seam
 * so existing import sites keep working.
 */
export {
  DEFAULT_BRAND,
  brandPalette,
  readableForeground,
  type BrandPalette,
  type Scheme,
  type SchemePreference,
} from './tokens';
