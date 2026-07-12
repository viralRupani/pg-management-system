# CLAUDE.md — apps/resident-web (Next.js resident web app)

The **resident** web app — a faithful, feature-complete replica of the Expo
resident app (`apps/mobile`) as a static-export Next.js SPA, so residents can
use it (installable PWA, "Add to Home Screen") without an app-store build.
Same NestJS API as every surface; the API is the only trust boundary. For
business context see root `CLAUDE.md`.

> **In lockstep with the 2026-07 mobile redesign** (re-ported 2026-07-12):
> design tokens + **light/dark mode**, Inter, micro-interactions, and all the
> post-06-19 mobile features (extra-charges breakdown, payment mode/proof +
> "Under review", UPI copy/QR, oldest-unpaid-first rent, Profile tab). When a
> mobile screen changes, re-port it here — the two surfaces share `@pg/shared`
> + `@pg/api-client` but duplicate screens (the accepted cost).

## Why this exists / the tradeoff
Avoids app-store cost until revenue justifies native builds — web ships first;
mobile follows once there are paying customers. **Cost accepted:** resident
features ship to two codebases (Expo + this). The shared `@pg/api-client` +
`@pg/shared` keep the data/type layer single-sourced; screens are duplicated.

## Stack
Next.js 16 (App Router, Turbopack) · **`output: 'export'`** (static SPA → `out/`)
· React 19 · Tailwind **v4** (`@tailwindcss/postcss`) · `@tanstack/react-query`
· `lucide-react` (via the `ui/icon.tsx` Ionicons-name registry) · Inter via
`next/font/google` (self-hosted at build) · hand-rolled primitives. Types from
`@pg/shared`, HTTP via `@pg/api-client`. Dev port **3001** (admin owns 3000).

## Static-export constraints (READ before adding pages)
Same as admin: no SSR/middleware/server-actions; everything `"use client"`.
**No runtime `[id]` routes** — detail views use `?id=` + `useSearchParams()`
wrapped in `<Suspense>` (invoices, complaints/thread). `next dev` does NOT catch
export violations — only `pnpm --filter @pg/resident-web build` does.

## The design system (the load-bearing part)
Mirrors the mobile token architecture 1:1 — **every color is a runtime CSS var**,
one mechanism for white-label accent AND light/dark:

- `lib/tokens.ts` — **verbatim copy of `apps/mobile/lib/tokens.ts`** (keep them
  identical): `NEUTRALS`/`SEMANTICS` per scheme, `brandPalette(accent, scheme)`
  (dark variant contrast-lifts arbitrary tenant accents), `themeVars()`,
  `resolveTokens()`.
- `lib/theme.tsx` — web ThemeProvider: holds accent (persisted
  `pg_resident_accent`) + scheme preference (`pg_resident_scheme`,
  system/light/dark via `matchMedia`), writes the full `themeVars()` set onto
  `document.documentElement.style` (+ `colorScheme`). `useTheme()`/`useTokens()`.
  The login slug step calls `setAccent()` after `GET /branding/:slug` (pre-auth
  theming, unlike admin). Sign-out clears the accent, not the scheme.
- `app/globals.css` — Tailwind v4 `@theme inline` maps every class
  (`bg-page`, `text-ink2`, `bg-amber-bg`, `rounded-card/field/tile/sheet/pill`,
  `text-brand-foreground-dim`, …) to those vars; `:root` seeds LIGHT defaults
  only (pre-provider frame). Also the keyframes (`sheet-up`, `shimmer`,
  `shake-x`, `pulse-dot`, `toast-in`, `fade-in-down`). **If a mobile class
  isn't defined here, that screen renders unstyled.** Alpha modifiers don't
  work on hex vars — use the `-dim`/`-line` tokens (same rule as mobile).
- `app/layout.tsx` — the **anti-flash inline script** embeds
  `NEUTRALS`/`SEMANTICS` from `lib/tokens.ts` at build time (can't drift) and
  replays scheme resolution + the full brand derivation (incl. the dark
  contrast-lift) before first paint, so a cold start with a saved session never
  flashes teal-on-light. Verified live: dark + lifted accent survive reload.

## Directory map
```
app/
  layout.tsx              server root: Inter, anti-flash script, Query→Auth→Theme
                          providers + ToastHost + SW
  page.tsx                '/' → /home or /login
  login/page.tsx          slug→phone→OTP wizard (OtpInput auto-submit, resend
                          countdown, pre-auth accent repaint)
  (app)/layout.tsx        client route guard + centered mobile column (max-w 480,
                          pb-68 for the tab bar) + <BottomTabs/>
  (app)/{home,rent,complaints,more}/page.tsx           the 4 tabs
  (app)/{announcements,menu,documents,deposit,notifications}/page.tsx
  (app)/invoices/page.tsx           detail (?id=, Suspense): charges breakdown,
                                    PaymentCard(s) (mode/proof/reference/reject
                                    reason), UPI copy + collapsible QR
                                    (save/share), submit sheet (UPI/cash
                                    Segmented, screenshot OR reference)
  (app)/complaints/new/page.tsx     category grid + photo upload
  (app)/complaints/thread/page.tsx  chat thread (?id=, Suspense, polls 3s)
components/
  auth-shell.tsx          staggered fade-in login chrome + PgBrandHeader
  bottom-tabs.tsx         custom bar: soft brand pill behind active icon
  service-worker.tsx      registers public/sw.js
  ui/                     web ports of ALL mobile primitives: text (AppText
                          variants), pressable-scale (active:scale), button,
                          input, card, badge + status.ts, row (Row/Ricon tone),
                          appbar, empty-state, error-state (use on every isError
                          branch), skeleton (shimmer), chip, fab, sheet
                          (slide-up/down + scrim, ESC, stacked-sheet safe),
                          segmented (sliding thumb), section-header, otp-input
                          (hidden input + shake), calendar (CalendarSheet),
                          toast (module-level toast.success/error/info +
                          ToastHost — same API as mobile), avatar, screen,
                          categories, icon (Ionicons-name → lucide registry),
                          file-picker (hidden <input type=file>)
lib/
  tokens.ts               = apps/mobile/lib/tokens.ts (keep identical)
  theme.tsx               ThemeProvider (see above)
  haptics.ts              navigator.vibrate shim (selection/tap/success/error)
  api.ts (localStorage TokenStore) · auth.tsx · utils.ts (ymd LOCAL, formatPaise,
  formatPeriod, clock) · query.ts/query-provider.tsx/queries.ts (mirrors mobile
  incl. invoicePayments) · upload.ts (web File + downloadCrossOrigin/shareImage)
public/  manifest.webmanifest · sw.js (versioned cache) · icon.svg
```

## Native→web swaps (when porting a mobile screen)
- `View`→`div`, `AppText`→`AppText` (same variants; renders a block `<span>`,
  `numberOfLines`→line-clamp), `PressableScale`→`PressableScale` (real
  `<button>`, `onPress`→`onClick`), Ionicons→`<Icon name="…">`.
- **Flex context:** RN `View` is implicit flex-column; a `div` is not. Add
  `flex flex-col`/`flex-row` wherever children use `items-*`/`justify-*`/
  `gap-*`/`flex-1`, or it silently no-ops.
- reanimated → the globals.css keyframes; expo pickers → `<FilePicker>` +
  `URL.createObjectURL` previews; `Alert.alert` → `toast.error` (blocking
  errors) or a confirm `<Sheet>` (destructive, e.g. logout); Clipboard →
  `navigator.clipboard`; QR save/share → `downloadCrossOrigin`/`shareImage`.
- Pull-to-refresh has no web equivalent — omit `RefreshControl`; error states
  carry the retry.
- Token storage → localStorage (`pg_resident_access`/`_refresh`/`_accent`/
  `pg_resident_scheme`).

## CORS
The browser enforces CORS (the native app doesn't): the API's `CORS_ORIGINS`
must include this app's origin. `http://localhost:3001` is in the dev default
(`apps/api/src/config/env.ts`); add the prod web origin at deploy time.

## Run / verify
```bash
pnpm --filter @pg/shared build            # required before typecheck/build
cp apps/resident-web/.env.example apps/resident-web/.env.local   # NEXT_PUBLIC_API_URL
pnpm --filter @pg/resident-web dev        # http://localhost:3001
pnpm --filter @pg/resident-web typecheck
pnpm --filter @pg/resident-web build      # static export → out/ (the REAL check)
pnpm --filter @pg/resident-web start      # preview out/ with no Next server
```
Backend must be running + seeded. Resident login: slug + phone + OTP (with
`OTP_DEV_LOG=true` read it from API logs, or read Redis key `otp:{tenantId}:{phone}`
directly; `OTP_DEV_FIXED_CODE` fixes it).
**Deploy:** sync `out/` to S3; set `NEXT_PUBLIC_API_URL` to the prod API at
build time.

## Status
**Re-ported to the mobile redesign + live-verified (2026-07-12)** against the
local API (tenant `bliss-homes`) via Playwright + system Chrome on the built
static export: full slug→phone→OTP login (real Redis OTP), pre-auth accent
repaint, home (floating rent card incl. overdue pulse, glance tiles, notices,
mess), rent (brand due card, segmented, year groups, oldest-first), complaints,
profile, **dark-mode toggle → correct dark neutrals + contrast-lifted accent,
both persisted across reload via the anti-flash script**, all pushed routes
render, **zero console errors**. Typechecks + exports 16 routes; token classes
verified in compiled CSS.
**Still untested:** the presigned upload round-trip against real S3 (KYC/
payment/complaint photo — the flows are ported, the api-client integration is
proven). No PNG `apple-touch-icon` yet (SVG only).
