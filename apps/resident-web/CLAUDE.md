# CLAUDE.md — apps/resident-web (Next.js resident web app)

The **resident** web app — a faithful, feature-complete replica of the Expo
resident app (`apps/mobile`) as a static-export Next.js SPA, so iPhone residents
can use it (installable PWA, "Add to Home Screen") without an App Store build.
Android residents keep the Play Store app. Same NestJS API as every surface;
the API is the only trust boundary. For business context see root `CLAUDE.md`.

## Why this exists / the tradeoff
Avoids the recurring Apple Developer cost until revenue justifies a native iOS
build. **Cost accepted:** resident features now ship to two codebases (Expo +
this). The shared `@pg/api-client` + `@pg/shared` keep the data/type layer
single-sourced; screens are duplicated.

## Stack
Next.js 16 (App Router, Turbopack) · **`output: 'export'`** (static SPA → `out/`)
· React 19 · Tailwind **v4** (`@tailwindcss/postcss`, tokens in `app/globals.css`)
· `@tanstack/react-query` (read hooks + complaint-thread polling) · `lucide-react`
· hand-rolled primitives. Types/validation from `@pg/shared`, HTTP via
`@pg/api-client`. Dev port **3001** (admin owns 3000).

## Static-export constraints (READ before adding pages)
Same as admin: no SSR/middleware/server-actions; everything `"use client"`.
**No runtime `[id]` routes** — detail views use `?id=` + `useSearchParams()`
wrapped in `<Suspense>` (invoices, complaints/thread). `next dev` does NOT catch
export violations — only `pnpm --filter @pg/resident-web build` does.

## The one load-bearing detail: the palette
`app/globals.css` translates the **entire** mobile Tailwind-v3 vocabulary
(`apps/mobile/tailwind.config.js`) into Tailwind v4 `@theme inline`: neutrals
(`ink/ink2/…`, `surface/page/line/…`) and status families (`amber/success/danger/
info` + `-bg`/`-dot`) as literals; the six `--brand*` tints as runtime CSS vars
(white-label). Radii `btn/card/sheet/pill`. **If a mobile class isn't defined
here, that screen renders unstyled.** Verify after changes:
`grep -o '\.bg-page{[^}]*}' out/_next/static/chunks/*.css`.

## White-labeling (pre-auth, unlike admin)
Resident types a PG slug → `GET /branding/:slug` (public) → `applyAccentColor()`
(`lib/theme.ts`) paints all six `--brand*` tints and persists the accent
(`pg_resident_accent`). The inline `<head>` script in `app/layout.tsx` **replays
the full palette derivation** (not just `--brand`) before first paint so a cold
start with a saved session never flashes teal.

## Directory map
```
app/
  layout.tsx              root: anti-flash script + PWA head + Query/Toast/Auth providers + SW
  page.tsx                '/' → /home or /login
  login/page.tsx          OTP wizard (slug→phone→OTP) as one client state machine
  (app)/layout.tsx        client route guard + centered mobile column + <BottomTabs/>
  (app)/{home,rent,complaints,more}/page.tsx          the 4 tabs
  (app)/{announcements,menu,documents,deposit,notifications}/page.tsx
  (app)/invoices/page.tsx           detail (?id=, Suspense) + payment Sheet + UPI QR
  (app)/complaints/new/page.tsx     raise + photo upload
  (app)/complaints/thread/page.tsx  chat thread (?id=, Suspense, polls 3s)
components/
  bottom-tabs.tsx, auth-shell.tsx, service-worker.tsx
  ui/                     button card badge input row appbar screen chip fab empty-state
                          skeleton avatar sheet(=dialog) status categories toast file-picker icon
lib/
  api.ts (localStorage TokenStore, resident keys) · auth.tsx (OTP signIn/signOut)
  theme.ts (brandPalette + applyAccentColor) · utils.ts (ymd LOCAL, formatPaise, …)
  query.ts/query-provider.tsx/queries.ts (ported from mobile) · upload.ts (web File)
public/  manifest.webmanifest · sw.js (versioned cache) · icon.svg · icon-maskable.svg
```

## Native→web swaps (when porting a mobile screen)
- `View`→`div`, `Text`→`span`/`p`, `Pressable`→`button`, `onPress`→`onClick`,
  Ionicons→`<Icon name="…">` (registry in `ui/icon.tsx`).
- **Flex context:** RN `View` is implicit flex-column; a `div` is not. Add
  `flex flex-col`/`flex-row` to any ported `View` that uses `items-*`/`justify-*`/
  `gap-*`/`flex-1` on children, or it silently no-ops.
- expo-image-picker/document-picker → `<FilePicker>` (`ui/file-picker.tsx`,
  hidden `<input type=file>`); upload via `uploadToPresignedPost(post, file)`.
- `Alert.alert` confirmations → `useToast()`; yes/no → `<Sheet>` with actions.
- QR save/share: cross-origin presigned URL → `downloadCrossOrigin` (fetch→blob)
  + `shareImage` (`navigator.share({files})`, feature-detected).
- Token storage → localStorage (`pg_resident_access`/`_refresh`/`_accent`).

## CORS
The browser enforces CORS (the native app doesn't), so the API's `CORS_ORIGINS`
must include this app's origin. `http://localhost:3001` is in the dev default
(`apps/api/src/config/env.ts`); add the prod web origin there at deploy time.

## Run / verify
```bash
pnpm --filter @pg/shared build            # required before typecheck/build
cp apps/resident-web/.env.example apps/resident-web/.env.local   # NEXT_PUBLIC_API_URL
pnpm --filter @pg/resident-web dev        # http://localhost:3001
pnpm --filter @pg/resident-web typecheck
pnpm --filter @pg/resident-web build      # static export → out/ (the REAL export check)
pnpm --filter @pg/resident-web start      # preview out/ with no Next server
```
Backend must be running (`pnpm --filter @pg/api dev`) + seeded. Resident login:
slug + phone + OTP (dev fixed `009009` via `seed-viral.mjs`).
**Deploy:** sync `out/` to S3 (same path as admin); set `NEXT_PUBLIC_API_URL` to
the prod API at build time.

## Status
Built; typechecks + statically exports cleanly (16 routes); palette verified in
compiled CSS. **Live-verified (2026-06-19)** against the seeded backend
(`seed.mjs`, PG `shreyank-pg`) via Playwright: full slug→phone→OTP login,
pre-auth theming repaint (`--brand` → `#10B981` + derived tints), home + rent
render with real data, bottom-tab nav, **zero console errors**; CORS for `:3001`
and all authenticated resident reads (`/invoices/mine`, `/deposits/mine`, etc.)
return 200. **Still untested:** the presigned upload round-trip (KYC/payment/
complaint photo) — api-client integration is proven but a real file PUT to the
local storage stub wasn't exercised. No PNG app icons yet — SVG only (iOS
home-screen icon is best with a PNG `apple-touch-icon`).

To reproduce the live test: start the API with `OTP_DEV_FIXED_CODE=009009` (+
`CORS_ORIGINS` incl. `:3001`), seed via `node apps/api/scripts/seed.mjs`, run
`NEXT_PUBLIC_API_URL=… pnpm dev`, then log in with slug `shreyank-pg`, phone
`8000000001`, code `009009`.
