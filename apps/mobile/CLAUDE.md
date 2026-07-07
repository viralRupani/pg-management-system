# CLAUDE.md — apps/mobile (Expo resident app)

> **Built (M8) — device-verified.** The resident app is feature-complete: OTP auth
> (slug → phone → OTP), swipeable bottom-tab nav, and every feature screen (Home
> with floating rent card + at-a-glance strip, Rent + invoice detail + submit-payment
> sheet, Complaints + raise + thread, KYC documents + upload, Deposit + ledger +
> move-out request, Announcements, Mess menu, Notifications, Profile/More + logout).
> `@pg/api-client` has resident methods; NativeWind white-label theming repaints from
> `GET /branding/:slug` and **persists across cold start**. Run in Expo Go on a
> physical Android phone: `var(--brand)` paints + repaints confirmed on native. For
> business context see root `CLAUDE.md`; the API is the only trust boundary
> (`apps/api/CLAUDE.md`).
>
> **UI architecture (2026-07 redesign — light + dark, Inter, animated):**
> `lib/tokens.ts` is the design-token source of truth: EVERY color (neutrals,
> semantic status, white-label brand) is a CSS var, resolved per
> `(scheme, accent)` — `themeVars()` feeds NativeWind `vars()`, `resolveTokens()`
> gives flat JS colors for icons/tints (never hard-code a hex in app code; the
> exit check is `grep -rn "#[0-9a-f]\{6\}" app components` → only lib/ hits).
> `ThemeProvider` (`components/theme-provider.tsx`) resolves the scheme
> (system-following + manual override on the More screen, persisted under the
> SecureStore key `pg_resident_scheme`), exposes `useTokens()`/`useThemeVars()`,
> owns the StatusBar, and applies the var set on the root View. **RN Modals
> portal out of the root tree: every Modal root MUST apply `useThemeVars()`**
> (see `components/ui/sheet.tsx` — it also needs its own GestureHandlerRootView).
> `lib/theme.ts` re-exports the brand seam; `brandPalette(accent, scheme)` has a
> dark variant that contrast-lifts arbitrary tenant accents. Typography = Inter
> (`@expo-google-fonts/inter`, splash-held in `_layout.tsx`, system-font
> fallback) rendered via `AppText` (`components/ui/text.tsx`) — raw `<Text>`
> can't select Inter files. Primitives in `components/ui/`: Button, Input
> (focus/error states), Card, Badge + `status.ts`, Row/Ricon (`tone` prop),
> Appbar, EmptyState, ErrorState (use on every `isError` branch), shimmer
> Skeleton, Chip, Fab, Sheet (spring + pan-to-dismiss), Segmented, SectionHeader,
> OtpInput (auto-submit), CalendarSheet (pure-JS, theme-aware), PressableScale
> (all tappables), toast (`toast.success/error/info` — replaces success/info
> Alerts; `Alert.alert` only for destructive confirms + blocking errors; close a
> Sheet BEFORE toasting), `lib/haptics.ts`. Auth state: `lib/auth.tsx` over the
> SecureStore token store. Read hooks + query keys: `lib/queries.ts`. Uploads:
> `lib/upload.ts` (`pickImage` + best-effort presigned PUT — see the dev-stub
> caveat there). The old `design/pg-app-ui-prototype.html` is superseded.

## Who uses this
**Residents** of a single PG — one tenant, one phone. The manager web app
(`apps/admin`) is the other surface. There is no resident web app and no manager
mobile app. Everything a resident can do is one of the resident-roled endpoints
below; RLS isolates *tenants*, and the API derives the resident id from the JWT
`sub` (never from request input), so a resident only ever sees their own rows.

## Locked decisions
From root §2 + backlog:
| Concern | Decision |
|---|---|
| Framework | React Native + **Expo, managed workflow** (TypeScript), one codebase Android + iOS |
| Auth | **slug (pgCode) + phone + OTP**; phone is unique *per-tenant* |
| Token storage | JWT in **expo-secure-store** (not AsyncStorage) |
| Pre-auth theming | public `GET /branding/:slug` (resident types the slug) — NOT the post-login `/tenants/branding` the admin uses |
| Types / validation | `@pg/shared` Zod schemas — same single source of truth as web |
| HTTP | `@pg/api-client` (ships TS source, no build step) — resident methods under `api.resident.*` |
| File uploads | S3 presigned URLs (request upload-url → PUT bytes → POST the key); pick images with **expo-image-picker** |
| Push | **expo-notifications** (Expo/FCM); `NotificationChannel` is a **stub** server-side today |
| Currency | integer paise everywhere; format to ₹ at the edge |

Stack picks (locked around the dev hardware — see Dev workflow below):
| Concern | Decision | Why |
|---|---|---|
| Routing | **expo-router** | file-based, same mental model as the Next.js admin app |
| Styling | **NativeWind v4** | Tailwind-for-RN; reuses admin's `--brand` accent + white-label pattern |
| Data / state | **TanStack Query** | read-heavy resident lists + pull-to-refresh; better than hand-rolled `useEffect` here |

Stack as built (Expo **SDK 54**, RN 0.81, React 19.1): NativeWind v4 runs on
**Tailwind CSS v3** (config-file style — *not* the admin's Tailwind v4 `@theme`).
`tsconfig` extends **`expo/tsconfig.base`** (not the repo's `tsconfig.base.json`)
and adds an `@/*` path alias.

> **Why SDK 54, not the scaffolded 56:** `create-expo-app@latest` scaffolds SDK
> 56 (npm tags it `latest`), but **Expo Go must support the project's SDK** and
> the installed Expo Go capped out at **SDK 54** (client 54.0.8). A too-new SDK
> gives *"Project is incompatible with this version of Expo Go."* Since Expo Go
> is the locked dev loop, the SDK is pinned to **whatever the phone's Expo Go
> supports** (54 here) — check it in the Expo Go app's home screen. Bump later
> only when the store Go advances, or move to an **EAS dev build** (any SDK).
> To downgrade an over-new scaffold: `pnpm add expo@~54.x` → `npx expo install
> --fix` (realigns RN/react/expo-* to the SDK matrix) → `npx expo install
> react-native-worklets`. If typecheck then errors on `process`, ensure the
> generated `expo-env.d.ts` (`/// <reference types="expo/types" />`) exists.

## Directory map
```
app/                       expo-router file-based routes
  _layout.tsx              ROOT: imports global.css; providers stack —
                           GestureHandlerRootView → SafeAreaProvider →
                           QueryClientProvider → AuthProvider → ThemeProvider →
                           Stack + ToastHost; hydrates SecureStore tokens AND
                           loads Inter (splash-held, system-font fallback via
                           lib/fonts.ts setInterLoaded) before rendering routes
  (auth)/                  login flow: slug → phone → OTP (auto-submit)
  (tabs)/                  swipeable bottom-tab nav + every feature screen
                           (home, rent, complaints, kyc, deposit, announcements,
                           mess, notifications, more)
components/
  ui/                      shared NativeWind primitives (Button, Input, Card,
                           Badge + status.ts, Row/Ricon (tone prop), Appbar,
                           EmptyState, ErrorState, shimmer Skeleton, Chip, Fab,
                           Sheet, Segmented, SectionHeader, OtpInput,
                           CalendarSheet, PressableScale, AppText, toast,
                           Avatar, Screen)
  theme-provider.tsx       resolves (scheme, accent) → applies the FULL token
                           var set via vars(); useTokens()/useThemeVars();
                           every Modal root re-applies useThemeVars() — RN
                           Modals portal out of root
lib/
  api.ts                   PgApiClient singleton + SecureStore-backed TokenStore
                           (in-memory cache for SYNC reads + async persist +
                           hydrateTokens()) + decodeToken/currentUser + persisted
                           accent/scheme; mirrors apps/admin/lib/api.ts
                           (localStorage → expo-secure-store)
  auth.tsx                 AuthProvider over the SecureStore token store
  queries.ts               read hooks + query keys (TanStack Query)
  query.ts                 TanStack QueryClient (retry 1, staleTime 30s)
  tokens.ts                DESIGN-TOKEN SOURCE OF TRUTH: light+dark neutrals +
                           semantics, scheme-aware brandPalette (dark contrast-
                           lift), themeVars()/resolveTokens()
  theme.ts                 pre-auth branding seam (re-exports from tokens.ts)
  fonts.ts                 Inter family registry + loaded flag (AppText reads it)
  haptics.ts               best-effort haptics (selection/tap/success/error)
  upload.ts                pickImage + best-effort presigned PUT (dev-stub caveat)
  utils.ts                 cn(), formatPaise (₹ from paise), ymd() local-date helper
global.css                 @tailwind directives + LIGHT defaults for all token
                           vars (pre-provider fallback only; imported in _layout)
tailwind.config.js         NativeWind preset; EVERY color → var(--…) (no fixed
                           hexes; alpha modifiers don't work on hex vars — use
                           the -dim/-line tokens)
babel.config.js            babel-preset-expo (jsxImportSource: nativewind) + nativewind/babel
metro.config.js            pnpm-monorepo aware (watchFolders=root, nodeModulesPaths)
                           + withNativeWind. See the inline note: do NOT set
                           disableHierarchicalLookup — pnpm needs hierarchical
                           lookup to resolve nested deps.
nativewind-env.d.ts        NativeWind className types + `*.css` module decl
.env.example               EXPO_PUBLIC_API_URL (Mac LAN IP, NOT localhost)
```

**pnpm + Metro gotchas already solved (don't regress):** (1) `metro.config.js`
keeps hierarchical lookup ON — the Expo guide's `disableHierarchicalLookup=true`
breaks pnpm (`expo` can't find `expo-modules-core`). (2) `react-native-css-interop`
is a **direct** dep of this package — the NativeWind JSX-runtime rewrite imports it
from app code, and pnpm only exposes direct deps. (3) `@pg/shared` must be built
(`pnpm --filter @pg/shared build`) before Metro can resolve its `dist/`.

## Dev workflow & hardware (MacBook Air M1 + Android phone, no iPhone)
- **Primary loop = Expo Go on the physical Android phone.** `npx expo start`, scan
  the QR; live reload over LAN (phone + Mac on the same Wi-Fi). No Android Studio
  / emulator needed.
- **iOS = the Simulator on the M1** (via Xcode, runs arm64 natively). No iPhone on
  hand, so real-device iOS testing is deferred (needs a device or TestFlight).
- **Managed workflow is deliberate:** bare RN would force local native builds on
  the M1 every test; Expo Go skips that. When we need a native module Expo Go
  can't host — **remote push notifications are the known one** (Expo removed
  Android push from Expo Go in recent SDKs) — switch to an **EAS development
  build** (cloud-compiled, so the M1 never builds native locally). Push is already
  deferred, so we stay in Expo Go until then.
- Everything else we build (SecureStore, image-picker, branding fetch, all the
  resident endpoints) works in Expo Go today.

## Auth flow (the entry point)
1. Resident enters **PG code (slug)** → `GET /branding/:slug` (public) themes the
   app + confirms the PG exists.
2. Enters **phone** → `POST /auth/resident/otp/request` `{ pgCode, phone }`.
   OTP lives in Redis (`otp:{tenantId}:{phone}`); dev code is logged when
   `OTP_DEV_LOG=true`.
3. Enters **OTP** → `POST /auth/resident/otp/verify` `{ pgCode, phone, code }` →
   `{ accessToken, refreshToken }` (role `RESIDENT`, `sub` = resident id) → store
   both in SecureStore.
4. `POST /auth/refresh` re-mints; 401 → single-flight refresh, else back to login.

## Resident-facing API surface (everything the app calls)
All resident-roled; tenant + actor come from the JWT. Upload endpoints follow the
**presign** pattern: `POST .../upload-url` → PUT bytes to the returned URL → `POST`
the resource with the returned **key** (store the key, never a URL).

| Verb · Path | Purpose |
|---|---|
| `GET /branding/:slug` *(public)* | theme login screen by PG slug |
| `POST /auth/resident/otp/request` / `/verify` *(public)* | OTP login |
| `POST /auth/refresh` *(public)* | rotate tokens |
| `GET /invoices/mine` | resident's rent invoices |
| `POST /payments/upload-url` → PUT → `POST /payments` | upload UPI screenshot + record payment against an invoice |
| `GET /deposits/mine` | own security-deposit + ledger |
| `POST /documents/upload-url` → PUT → `POST /documents` | submit a KYC document |
| `GET /documents/mine` | own KYC docs + status (pending/verified/rejected) |
| `POST /complaints/photo-url` → PUT → `POST /complaints` | raise a complaint (optional photo) |
| `GET /complaints/mine` | own complaints |
| `GET /complaints/:id/updates` / `POST /complaints/:id/updates` | complaint thread (shared with manager) |
| `GET /announcements` | PG announcements feed |
| `GET /menu/config` + `GET /menu?from=&to=` | mess menu (materialized cycle for a date range) |
| `POST /notifications/push-token` | register Expo push token |
| `GET /notifications` / `POST /notifications/:id/read` | in-app notification feed |

**Dates to the API**: zero-padded **local** `YYYY-MM-DD`, never `toISOString()`
(UTC is off-by-one in IST) — same landmine the web app hit.

## Backend bits — status
- ✅ **`POST /deposits/exit-request`** — added (resident-roled; `exit_requested_*`
  columns on `users`, conditional-flip guard; surfaced on `GET /deposits/mine`).
- ✅ **Resident complaint-photo read** — `GET /complaints/:id/photo` is now shared
  (`@Roles(RESIDENT, PG_MANAGER)`, ownership-scoped for residents).
- ✅ **`@pg/api-client` resident methods** — added under `api.resident.*` (+ OTP/
  refresh on `api.auth.*`).
- ⏳ **Announcement push fan-out** — still per-user; `POST /announcements` does not
  fan out to existing residents. Deferred (push is stubbed anyway).
- ⏳ **Real Expo push driver** — `NotificationChannel` stub; needs an EAS dev build
  + `expo-notifications`. The in-app feed works in Expo Go; push-token
  registration is NOT wired (no token source under Expo Go). Deferred.

## Build / run
The API must be reachable from the **physical phone** — use the Mac's LAN IP, not
`localhost`, for `EXPO_PUBLIC_API_URL` (the phone can't reach the Mac's loopback).

```bash
pnpm install                              # from repo root (one-time / after dep changes)
pnpm --filter @pg/shared build            # Metro resolves @pg/shared's dist/ — required first
cp apps/mobile/.env.example apps/mobile/.env
# set EXPO_PUBLIC_API_URL to your Mac's LAN IP, e.g. http://192.168.1.42:4000
#   find it with: ipconfig getifaddr en0

cd apps/mobile && npx expo start          # scan the QR in Expo Go on the Android phone
                                          # (phone + Mac on the same Wi-Fi)
pnpm --filter @pg/mobile typecheck        # tsc --noEmit
```

Verify a clean Metro bundle without a device (catches resolution breaks in CI):
`cd apps/mobile && CI=1 npx expo export --platform android --output-dir /tmp/x`.

Resident login: seed a resident via `node apps/api/scripts/seed-demo.mjs`
(Sunrise PG) and read the dev OTP from the API logs (`OTP_DEV_LOG=true`), or use
`seed-viral.mjs` (fixed dev OTP `009009`). Real OS push needs an **EAS dev build**
(Expo Go dropped Android push) — deferred; the in-app notifications feed works in
Expo Go today.
