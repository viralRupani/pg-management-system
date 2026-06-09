# CLAUDE.md — apps/mobile (Expo resident app)

> **Planning stub — the app is NOT built yet (M8).** This doc captures the
> resident API surface, already-locked decisions, and what's still missing, so
> the build session starts with full context. Stack details marked **(proposed)**
> are NOT decided — confirm them in the planning step before scaffolding. For
> business context see root `CLAUDE.md`; the API is the only trust boundary
> (`apps/api/CLAUDE.md`).

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

(Directory map: none yet — written at scaffold time.)

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

## Missing backend bits (build or stub before the matching screen)
These resident endpoints/helpers do NOT exist yet (see `docs/backlog.md`):
- **`POST /deposits/exit-request`** — resident-initiated exit (only manager-driven
  `POST /deposits/exit` exists today). Needed for the move-out screen.
- **Resident complaint-photo read** — only the manager `GET /complaints/:id/photo`
  exists; a resident-scoped read isn't added.
- **Announcement push fan-out** — `NotificationsService.notify` is per-user; no
  broadcast helper, so new announcements don't push yet.
- **`@pg/api-client` resident methods** — the client is manager-only; add the
  resident counterparts (mirror the table above) as the first M8 task.
- **Real Expo push driver** — swap the `NotificationChannel` stub at deploy time.

## Build / run (once scaffolded)
The API must be reachable from the device/emulator — use the host LAN IP, not
`localhost`, for `EXPO_PUBLIC_API_URL`. Seed a resident via
`node apps/api/scripts/seed-demo.mjs` (Sunrise PG) and read the dev OTP from the
API logs (`OTP_DEV_LOG=true`). Add real run commands here when the app exists.
