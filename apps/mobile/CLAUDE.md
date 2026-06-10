# CLAUDE.md — apps/mobile (Expo resident app)

> **Built (M8) — pending on-device verification.** The resident app is feature-
> complete: OTP auth (slug → phone → OTP), bottom-tab nav, and every feature
> screen (Home, Rent + invoice detail + submit-payment sheet, Complaints + raise +
> thread, KYC documents + upload, Deposit + ledger + move-out request,
> Announcements, Mess menu, Notifications, Profile/More + logout). `@pg/api-client`
> has resident methods; NativeWind white-label theming repaints from
> `GET /branding/:slug`. Verified by `tsc --noEmit` + a clean `expo export`
> bundle — **not yet run on a physical device** (the one thing those checks can't
> cover: that `var(--brand)` actually paints/repaints on native). For business
> context see root `CLAUDE.md`; the API is the only trust boundary
> (`apps/api/CLAUDE.md`).
>
> **UI architecture:** shared NativeWind primitives in `components/ui/` (Button,
> Input, Card, Badge + `status.ts` mappers, Row/Ricon, Appbar, EmptyState,
> Skeleton, Chip, Fab, Sheet, Avatar, Screen). Theming: `tailwind.config.js`
> `brand.*` → CSS vars; defaults in `global.css`; `ThemeProvider`
> (`components/theme-provider.tsx`) repaints via `vars()`; `Sheet` re-applies the
> palette because RN Modals portal out of the root tree. Auth state:
> `lib/auth.tsx` over the SecureStore token store. Read hooks + query keys:
> `lib/queries.ts`. Uploads: `lib/upload.ts` (`pickImage` + best-effort presigned
> PUT — see the dev-stub caveat there).

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
| HTTP | `@pg/api-client` (ships TS source, no build step) — **resident methods not added yet** |
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

## Directory map (as scaffolded)
```
app/                       expo-router file-based routes
  _layout.tsx              ROOT: imports global.css; providers stack —
                           SafeAreaProvider → QueryClientProvider → Stack;
                           hydrates SecureStore tokens before rendering routes
  index.tsx                Hello-World placeholder home screen
components/ui/             shared NativeWind primitives (Button seeded)
lib/
  api.ts                   PgApiClient singleton + SecureStore-backed TokenStore
                           (in-memory cache for SYNC reads + async persist +
                           hydrateTokens()) + decodeToken/currentUser; mirrors
                           apps/admin/lib/api.ts (localStorage → expo-secure-store)
  query.ts                 TanStack QueryClient (retry 1, staleTime 30s)
  theme.ts                 pre-auth branding seam (DEFAULT_BRAND + readableForeground)
  utils.ts                 cn(), formatPaise (₹ from paise), ymd() local-date helper
global.css                 @tailwind directives (imported once in _layout)
tailwind.config.js         NativeWind preset + `brand` color token (teal #0d9488)
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

For the (future) resident login: seed a resident via
`node apps/api/scripts/seed-demo.mjs` (Sunrise PG) and read the dev OTP from the
API logs (`OTP_DEV_LOG=true`). Push notifications need an **EAS dev build** (Expo
Go dropped Android push) — stay in Expo Go until that screen is built.
