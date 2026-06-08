# CLAUDE.md — PG Management System

> Onboarding doc for any Claude session. Read this first. It captures the
> business context, architecture, decisions, current progress, and next steps so
> you can continue without re-deriving everything.
> Companion docs: `apps/api/CLAUDE.md` (API conventions), the approved plan at
> `~/.claude/plans/i-want-to-build-smooth-dragonfly.md`.

---

## 1. What this is

A **multi-tenant SaaS** for paying-guest (PG) hostels in Ahmedabad, India. PGs
currently run rent, complaints, KYC, bed assignment, and announcements manually
over WhatsApp. This product moves that into a structured workflow:

- **Manager web dashboard** (Next.js) — rent collection, resident registration,
  bed assignment, KYC/documents, complaints, menu, budgets, announcements.
- **Resident mobile app** (Expo, Android + iOS) — menu, rent payment (upload a
  screenshot, manager approves), complaints, allocation info, exit/deposit.
- Sold to many PGs; each PG's data is strictly isolated and the app feels
  bespoke per PG (white-labeling).

### Business model
- **Pricing: ₹10 per active resident PER MONTH (recurring).** Confirmed.
- "Active resident" = currently bed-allocated. Metered monthly into
  `billing_snapshots` per tenant.
- Collection is **manual** (offline UPI) for now; the billing module keeps a
  clean seam so a gateway (Razorpay/Stripe) can plug in later.
- **No payment gateway for resident rent** — residents upload a payment
  screenshot, the manager approves/rejects it.

---

## 2. Locked business & technical decisions

| Decision | Choice | Why |
|---|---|---|
| Tenant isolation | **Shared Postgres DB + Row-Level Security** | Cheapest to run, scales to many PGs, fits ₹10/resident economics. |
| Mobile app | **React Native + Expo** (TypeScript) | One codebase Android+iOS; shares TS types with backend. |
| Web admin | **Next.js, static export** (`output: 'export'`, client-only) | User wants no frontend server. **No SSR / middleware-auth / server-actions** — the NestJS API is the only trust boundary. |
| Backend | **NestJS + Postgres + Drizzle ORM** | Drizzle gives explicit connection control needed for RLS `SET LOCAL`. |
| Auth | **Phone OTP** for residents, **email+password** for managers | Matches Indian resident expectations; managers use a dashboard. |
| Resident phone uniqueness | **Per-tenant** (not global) | People move between PGs; each PG keeps its own history. So resident login needs a **PG code (slug)** + phone + OTP. |
| Notifications | **In-app push only for now** (Expo/FCM) | WhatsApp/SMS/email deferred behind a channel abstraction. |
| File storage | **AWS S3** (presigned URLs) | KYC docs, payment screenshots, complaint photos, logos. |
| Platform billing | **Manual now, meter headcount in-app** | Super-admin dashboard shows per-PG counts; collect offline. |
| Hosting | **Local dev now** (Docker); cloud later | Deployment decisions deferred. |
| Build approach | **Full system upfront**, sequenced in milestones | User wants the complete feature set, built in dependency order. |

---

## 3. Architecture overview

**Monorepo** — pnpm workspaces + Turborepo:

```
apps/
  api/      NestJS backend — the ONLY server (auth, RLS, business logic)
  admin/    Next.js manager dashboard — static export (M7: foundation built)
  mobile/   Expo resident app (NOT yet built)
packages/
  shared/   Zod schemas + enums — single source of truth for all 3 surfaces
  api-client/ typed fetch client over @pg/shared (admin + mobile; M7, NEW)
infra/      docker-compose (Postgres 16 on host :5433, Redis 7 on :6379)
```

Shared types: `@pg/shared` (built to CommonJS `dist/`). API validates request
bodies with these Zod schemas via `ZodBody` pipe; admin/mobile reuse them via
`@pg/api-client` (which ships TS source, transpiled by each app's bundler).

### Tenant isolation (the load-bearing design — do not weaken)
Three layers, all required:
1. **Postgres RLS** on every tenant table (listed in `RLS_TABLES`,
   `apps/api/src/db/schema/index.ts`), with both `USING` and `WITH CHECK`:
   `tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid`.
   Unset context → NULL → **fail-closed** (zero rows).
2. **Connection-pinned `SET LOCAL`**: `TenantContextService.run()`
   (`apps/api/src/db/tenant-context.ts`) opens a transaction, sets
   `app.current_tenant_id` transaction-locally, and runs the handler inside
   `AsyncLocalStorage`. `TenantContextInterceptor` wraps every authenticated
   tenant request. **Tenant id comes ONLY from the JWT — never request input.**
3. **DB role separation**:
   - `app_user` (NOBYPASSRLS) — all tenant requests. (Roles can't start with
     `pg_` — reserved by Postgres.)
   - `platform_user` (BYPASSRLS) — ONLY the platform module, for cross-tenant
     metering/super-admin.
   - `postgres` (owner) — runs migrations only.
4. **Composite FKs carry `tenant_id`** (the 4th layer, added in M2). Postgres
   runs FK/unique checks with **RLS bypassed**, so a plain `parent_id` FK would
   let tenant A reference tenant B's row. Every parent table has
   `unique(id, tenant_id)`; every child references `(parent_id, tenant_id) →
   parent(id, tenant_id)`. Combined with `WITH CHECK` (child.tenant_id = context),
   this makes `parent.tenant_id = context` provable at the schema level — a
   cross-tenant reference is unrepresentable, no app-code reliance. **Every new
   tenant-child table must use this pattern, not a bare FK.**
5. **App-layer ownership for same-tenant actors** (the 5th layer, from M3). RLS
   keys on `tenant_id`, so it does **NOT** isolate residents from each other
   within one PG — every resident in a tenant shares that tenant_id. So every
   resident-facing endpoint must derive the actor's id from the JWT `sub` and
   filter/own by it (`where resident_id = sub`); manager-set fields are taken
   from `sub`, never the request body. Same "never from request input" lesson as
   tenant_id, one level down. The gate test pins this: under one tenant's context
   RLS returns *all* residents' invoices, proving the app layer is what
   separates them.

`tenants` and `auth_identities` deliberately have **NO RLS**: login must resolve
a user/tenant before any context exists, and the login screen needs branding by
slug. Login lookups use the `app_user` pool against these two non-RLS tables —
NOT the BYPASSRLS pool — so login's blast radius is contact+credential only.

### White-labeling
Per-tenant name/logo/accent-color/slug. RLS handles *data* isolation; branding
handles *perceived* isolation. There is intentionally **no tenant-list endpoint**
on the tenant path, so one PG can't enumerate others.

---

## 4. Current progress

### ✅ Milestone 1 — Multi-tenant foundation (DONE, verified)
- Monorepo, docker-compose (Postgres :5433, Redis :6379), `@pg/shared`.
- Drizzle schema: `tenants`, `auth_identities`, `users` (+ generated migration).
- RLS policies + tenant-context interceptor + role separation (see §3).
- Auth: manager email/password (argon2 + JWT access/refresh), resident phone-OTP
  (Redis + console SMS stub), roles guard.
- Platform onboarding (create PG + first manager via BYPASSRLS pool).
- Residents module (register / list / get-by-id) under RLS.
- **Verified two ways, both green:**
  1. `pnpm --filter @pg/api test:isolation` (`apps/api/src/rls/rls-isolation.spec.ts`)
     — forces connection reuse (pool max=1) as `app_user`; covers reads,
     fail-closed deny, forged-`tenant_id` `WITH CHECK` rejection, platform bypass.
  2. Live HTTP e2e — two PGs onboarded; Manager A's resident invisible to
     Manager B (list empty, by-id 404), unauthenticated 401.

### ✅ Milestone 2 — Property & people (DONE, verified)
- Schema: `buildings → floors → rooms → beds` + `allocations`, all RLS tables.
  **Composite FKs carry `tenant_id`** (child references `(parent_id, tenant_id)`,
  parents have `unique(id, tenant_id)`) so a cross-tenant parent reference is
  unrepresentable — FK/unique checks bypass RLS, so tenant scoping must live in
  the FK itself (see §3). Money is **integer paise** (`monthly_rent_paise`) — the
  project-wide convention for all currency columns.
- `allocations`: `end_date IS NULL` = active; two **partial-unique indexes**
  (one active allocation per bed, one per resident) are the DB-level backstop
  against double-booking. `beds.status` is a convenience mirror, mutated only in
  the same txn as the allocation.
- `PropertyModule` (CRUD buildings/floors/rooms/beds) + `AllocationModule`
  (allocate / move-out / list active / `GET /allocations/suggestions` — a
  filter+score ranker over occupation/age-band/native-place). `residents`
  list/get now show the resident's current `bedLabel`.
- **Verified two ways, both green:** isolation gate test now 8/8 (adds
  allocations scoping, cross-tenant composite-FK rejection, no-double-booking);
  HTTP e2e (25 assertions) covers the full flow + cross-tenant 404s, including
  the real unique-violation→409 catch path (same resident, second bed).
- **Deliberately deferred (M2 follow-up, not done):** Property is **create+list
  only** — no update/delete/get-by-id on buildings/floors/rooms/beds. The admin
  dashboard will need at least *edit room rent* (feeds the M3 rent loop), *rename*,
  and *decommission bed*; pull these in when building the admin app or at the
  start of M3, whichever comes first. Don't assume property CRUD is complete.

### ✅ Milestone 3 — Core rent loop (DONE, verified)
- **M3a (core loop):** `invoices` (per resident per `period` 'YYYY-MM',
  `unique(resident_id, period)` → idempotent generation) + `payments`
  (screenshot S3 key, lifecycle SUBMITTED→APPROVED|REJECTED). `RentService`:
  `generateMonthly` (from active allocations→room rent, `ON CONFLICT DO NOTHING`),
  resident submit, manager approve (→invoice PAID)/reject. `StorageModule`
  (presigned-URL seam; local stub, tenant-namespaced keys). Pulled in the
  deferred **edit-room-rent** (`PATCH /property/rooms/:id/rent`).
- **M3b (automation):** `NotificationsModule` (feed `notifications` +
  `push_tokens` + `NotificationChannel` abstraction with an Expo push **stub**);
  `JobsModule` (**BullMQ** on Redis) — repeatable monthly-generation + daily
  reminders that fan out to `JobsService`, which lists active tenants via
  `PlatformService.listActiveTenantIds()` then runs each tenant **under its own
  RLS context** (`TenantContextService.run`) with per-tenant failure isolation.
  Platform-admin endpoints (`POST /platform/jobs/*`) trigger the same service
  synchronously for ops/tests.
- **🔑 New load-bearing principle: RLS isolates TENANTS, not residents within a
  tenant.** M3 is the first surface with same-tenant actors. Every resident
  endpoint derives `residentId`/`userId` from the JWT `sub` (never the body) and
  filters/owns by it; manager-set fields (`reviewedByUserId`) come from `sub`
  too. RLS is not a substitute for these app-layer ownership checks (see §3.5).
- **Verified three ways, all green:** gate test now 9/9 (adds invoice cross-tenant
  scoping + an explicit assertion that RLS exposes *all* residents' invoices
  within a tenant, pinning why app-layer ownership is required); two HTTP e2es —
  M3a (25 assertions: generate→submit→approve/reject, idempotency, state guard,
  intra-tenant resident isolation 404s, edit-rent) and M3b (cross-tenant job
  generation, reminders tracking PENDING, per-resident notification feed, push
  stub fired); plus a **BullMQ worker integration check** — enqueue to the real
  `rent-jobs` queue → in-process worker runs `JobsService` → invoice appears (the
  actual scheduled path, not the sync endpoint).
- **Deferred (M3 follow-ups, not done):** (1) **Reminder scoping** —
  `sendRentReminders(undefined)` notifies on *every* PENDING invoice regardless
  of month, and the daily repeatable job passes no period, so an old unpaid
  invoice would re-notify every day. Scope reminders to the current/overdue
  period (or dedup per period per day) before this runs in production. (2) No
  OVERDUE transition yet — invoices stay PENDING past `due_date`; add a job/flag
  when needed.

### ✅ Milestone 4 — Documents/KYC + deposits + exit settlement (DONE, verified)
- Schema: `documents` (resident KYC, S3 key, PENDING→VERIFIED|REJECTED review
  guard like payments), `deposits` (one per resident, `unique(resident_id)`,
  HELD→SETTLED), `deposit_transactions` (append-only exit ledger; composite FK).
- `DocumentsModule` — resident upload-url/submit/list-own; manager
  list/download-url/verify/reject. `DepositsModule` — manager record deposit,
  list, by-resident+ledger; resident `/deposits/mine`.
- **Exit settlement** (`POST /deposits/exit`) — one transaction: a **conditional
  re-entry guard** flips the resident ACTIVE→EXITED *first* (0 rows → 409, before
  any side effect, concurrency-safe), then records deduction line-items, computes
  `refund = held − Σdeductions` (rejects over-deductions so `held = Σded + refund`
  always holds), writes a REFUND line, sets deposit SETTLED, and ends the active
  allocation / frees the bed. No deposit / no allocation → still exits (refund 0).
- **🔑 Pattern reinforced:** status transitions with irreversible side effects
  (exit, like M2 double-booking / M3 double-approve) need a **conditional flip +
  rows-affected check before the side effects**, not select-then-update. The
  guard goes on the always-present entity (resident status), not the optional one
  (deposit).
- **Verified two ways, both green:** gate test now 10/10 (adds documents+deposits
  cross-tenant scoping); HTTP e2e (26 assertions) covers KYC verify/reject + guard,
  one-deposit-per-resident, **money conservation** (held=Σded+refund),
  double-settle 409, over-deduction reject **with proven rollback**, intra-tenant
  `mine` filtering, and the cross-milestone tie: an exited resident's ended
  allocation makes `generateMonthly` bill them **zero**. Edge branches (exit with
  no deposit → refund 0; exit with no active allocation → `bedFreed:false`) are
  covered too.
- **Deferred (M4 follow-up):** resident-*initiated* exit request — the plan's
  exit flow starts with the resident requesting, but only manager-driven
  settlement is built. Add a resident `POST /deposits/exit-request` (notifies
  managers) when building the mobile app (M7).

> ✅ **Cross-cutting test-coverage gap — RESOLVED (2026-06-08):** the throwaway
> `/tmp/m*-e2e.mjs` scripts are now promoted to a committed e2e suite under
> `apps/api/src/e2e/` (supertest + `@nestjs/testing`), driven by a shared
> `harness.ts` that boots the real `AppModule` in-process and exercises it over
> HTTP. **Full suite: 50 tests / 5 files, all green** — `rls-isolation.spec.ts`
> (11, the DB gate) + `property-allocation` (M2), `rent` (M3),
> `documents-deposits` (M4), `operations` (M5). Run with `pnpm --filter @pg/api
> test` (now `--runInBand`, since every spec shares one Postgres + Redis) or
> `test:e2e` for just the e2es. The harness reuses the app's own `JwtService`
> (real access secret) + `REDIS` (reads the dev OTP), onboards unique-slug
> tenants, and deletes them on teardown. M6 metering can now build on this net.
> **Deliberately NOT covered: the M3b cross-tenant batch job**
> (`generateInvoicesAllTenants` reads ALL tenants — a shared-DB contamination
> vector; keep any job coverage in a separate scoped spec, not the money gate.)

### ✅ Milestone 5 — Operations layer (DONE, verified)
Complaints, menu, announcements, budgets/expenses (no money-movement between
parties, so lighter than M3/M4).
- [x] Schema: `complaints` + `complaint_updates`, `menu_items`, `announcements`,
  `budgets` + `expenses` (+ MealType / ComplaintCategory enums). RLS + composite
  FKs. Migration `0005`, all 6 tables RLS-enabled.
- [x] ComplaintsModule (resident file + photo + thread; manager assign/status) —
  e2e green (16 assertions incl. R1 can't touch R2's thread → 404).
- [x] MenuModule — tenant-SHARED (reads NOT user-filtered). Manager upserts a
  date+meal (`POST /menu`, `ON CONFLICT (tenant,date,meal) DO UPDATE`); anyone in
  the tenant reads an inclusive `[from,to]` range (`GET /menu?from=&to=`).
- [x] AnnouncementsModule — tenant-SHARED. Manager `POST /announcements` (author
  from JWT sub); anyone in the tenant `GET /announcements` (newest first).
- [x] BudgetsModule — **manager-only** (class-level `@Roles(PG_MANAGER)`; the
  guard reads class metadata via `getAllAndOverride([handler, class])`, verified
  by resident-403 e2e assertions). `POST /budgets` (upsert per tenant+category+
  period), `POST /expenses`, `GET /expenses?period=`, `GET /budgets/summary?period=`
  (spend-vs-budget per category; `limitPaise` null where no budget; expenses
  matched to period via `to_char(spent_on,'YYYY-MM')`). Money is integer paise.
- [x] Verify: gate test now **11/11** (adds "scopes the M5 operations tables
  across tenants" — seeds all 6 M5 tables for PG A, asserts PG B sees zero); HTTP
  e2e **20/20** (`/tmp/m5-ops-e2e.mjs`: menu upsert+range+cross-tenant, resident
  CAN read menu/announcements but CANNOT post/manage, budget upsert + spend
  summary with July excluded + no-budget→null limit, resident-403 on all budget
  routes, cross-tenant empties, missing-param 400s).
Patterns used: tenant-SHARED tables (menu/announcements) leave reads
unfiltered — RLS tenant-scoping is the whole isolation requirement; author/
recorder fields come from JWT sub, never the body; upserts via
`onConflictDoUpdate` on the unique constraint.

> **M5 follow-up (deferred):** announcements do NOT fan out a per-resident
> notification (no broadcast helper exists; `NotificationsService.notify` is
> per-user). Wire announcement → notification fan-out when building the resident
> mobile app (M7), or add a `notifyAllResidents` helper first.

### ✅ Milestone 6 — Super-admin metering + white-labeling (DONE, verified)
- **Metering:** `billing_snapshots` (`tenantId, period, activeResidents,
  ratePaise, amountDuePaise`, `unique(tenantId, period)` → idempotent; rate +
  amount **denormalized** so historical rows are immutable if pricing changes).
  In `RLS_TABLES` for fail-closed defense, but written/read ONLY by the platform
  module via `PLATFORM_DB` (BYPASSRLS) — legitimately cross-tenant metering.
  `MeteringService` (platform module): `snapshotMonth(period?)` counts active
  (bed-allocated, `end_date IS NULL`) residents per ACTIVE tenant and upserts
  (ON CONFLICT REFRESHES the count, not duplicates); `listSnapshots(period?)`;
  `liveOverview()` (current headcount + recurring-revenue estimate, computed
  live). Rate = `BILLING_RATE_PAISE` (1000 = ₹10) in `@pg/shared`. Endpoints:
  `GET /platform/overview`, `POST /platform/billing/snapshot`,
  `GET /platform/billing/snapshots` (all PLATFORM_ADMIN). A BullMQ repeatable
  `monthly-billing-snapshot` job (1st @ 03:00) runs the same service.
- **White-labeling:** `BrandingModule`. `GET /branding/:slug` is **public**
  (login screen needs branding pre-auth) and reads `tenants` via the **app_user
  pool** (`APP_DB`), like login — NOT the platform pool. Manager self-service:
  `GET`/`PATCH /tenants/branding` + `POST /tenants/logo-url`. **Logo follows the
  same key-not-URL pattern as payments/documents:** `logo-url` returns a storage
  `key`, the manager PATCHes `{ logoKey }`, and the branding read **presigns the
  key into a fresh `logoUrl`** (the response field) — never stores a raw URL.
  (The `tenants` DB column keeps its old name `logo_url` for migration stability
  but holds a KEY; the TS field `logoKey` is the source of truth.)
  **Load-bearing:** `tenants` has NO RLS, so the manager update scopes
  `where id = currentTenantId()` EXPLICITLY (the no-RLS analog of "never trust
  request input" — RLS can't fence this table, the JWT tenant id is the only
  thing keeping a manager on their own PG). No tenant-LIST endpoint exists.
- **Verified two ways, both green:** gate test now **12/12** (adds
  billing_snapshots cross-tenant + fail-closed defense-in-depth); HTTP e2e
  `metering-branding.e2e-spec.ts` (per-PG headcount + revenue, moved-out resident
  not counted, snapshot denormalized amounts, re-snapshot REFRESHES not
  duplicates, manager-403 on platform routes; public branding read, 404 on
  unknown slug, manager update reflected publicly + scoped so it can't touch
  another PG, empty/bad-color 400s, the **full logo round-trip** upload-key →
  PATCH → public presign, resident-403). All metering assertions scope to the
  run's tenant ids (the platform pool sees every tenant — see harness note in
  `apps/api/CLAUDE.md`). Full suite: `pnpm --filter @pg/api test` = **63 tests /
  6 files**.

### 🚧 Milestone 7 — Frontends (IN PROGRESS)
Admin web app (Next.js static export) + resident mobile app (Expo), consuming the
same API. UI CONFIRMED: shadcn-style (admin) + NativeWind (mobile), accent-color
theming for white-labeling. **Admin first** (decided 2026-06-08); mobile next.
See `apps/admin/CLAUDE.md` for admin conventions (esp. the static-export rules).

- **✅ `packages/api-client`** (NEW) — framework-agnostic typed fetch client over
  `@pg/shared`, consumed by admin (and later mobile) via `transpilePackages`.
  Ships **TS source** (`main: src/index.ts`, no build step). Injectable
  `TokenStore` (admin → localStorage; mobile → SecureStore later) +
  `onUnauthorized`; **single-flight refresh-on-401** retry. Resource methods
  mirror the controllers — auth, branding, residents (list/get/register),
  allocations (list/suggestions/allocate/move-out), property, invoices
  (list/generate), payments (list/screenshot/approve/reject), documents
  (list/download/verify/reject), deposits (by-resident/record/exit), complaints
  so far — extend as pages are built. (Manager surface only; resident-facing
  methods come with the mobile app.)
- **✅ Admin foundation (DONE, verified):** Next 16 App Router, `output:'export'`
  (pure client SPA, **no SSR/middleware** — API is the only trust boundary),
  Tailwind v4, hand-rolled shadcn-style primitives. Built: **auth** (manager
  email/password login, JWT in localStorage, `AuthProvider`/`useAuth`, client
  route guard), **white-label theming** (neutral login → after login paint
  `accentColor` from `GET /tenants/branding` into the `--brand` CSS var; logo in
  sidebar), **app shell** (white-labeled sidebar nav + topbar; unbuilt sections
  are disabled `soon` stubs), **dashboard** (stat cards + pending-payments +
  open-complaints panels) wired to live `/residents` `/allocations`
  `/payments?status=SUBMITTED` `/complaints`.
  - **Verified:** `next build` static export green (all routes prerendered) + TS
    green + api-client typecheck green; **real browser click-through** (headless
    Chromium via Playwright) — manager login → redirect to /dashboard → the teal
    accent actually paints (`--brand`=#0d9488, active-nav bg rgb(13,148,136), so
    `applyAccentColor` ran from `/tenants/branding`) → cards show seeded data
    (5 residents / 4 beds / 1 pending payment ₹8,000 / 2 complaints) and both
    panels list the real rows. (Not a committed test yet — drove a throwaway
    Playwright script; a committed admin e2e is a future follow-up.)
  - **🔑 Static-export gotchas (locked in, see `apps/admin/CLAUDE.md`):** no
    file-based dynamic routes for runtime data — **detail views use `?id=` +
    client fetch**, not `[id]`; `next dev` hides export violations, only `next
    build` surfaces them; `next/image` unoptimized; everything is `"use client"`.
  - **🔑 Theming insight:** manager login can't theme from `/branding/:slug` (no
    slug pre-auth — that route is for the *resident* app); manager themes
    post-login via `/tenants/branding` (keyed off the JWT).
- **✅ `apps/api/scripts/seed-demo.mjs`** (NEW) — onboards demo PG "Sunrise PG"
  (`manager@sunrise.pg` / `password123`, teal accent), property, 5 residents, 4
  allocations, invoices, 1 submitted payment, 2 complaints. Mints a
  PLATFORM_ADMIN token via `JWT_ACCESS_SECRET` (no super-admin login endpoint)
  and reads the dev OTP from Redis via `redis-cli`. Fixed slug → re-run is a
  no-op (409). **Note:** the on-disk `apps/api/dist` was stale (pre-branding);
  rebuild API (`pnpm --filter @pg/api build`) before running against `dist`.
- **✅ `components/ui/dialog.tsx`** (NEW primitive) — hand-rolled modal (backdrop
  + Esc + body-scroll lock), used for every create/edit/confirm form. No shadcn
  CLI; matches the other `ui/` primitives.
- **✅ Rent page (DONE, build-verified):** `(app)/rent/page.tsx` — tabbed
  **Payments** review queue (status filter; approve / reject-with-note /
  view-screenshot via presigned URL) + **Invoices** list with a **Generate
  invoices** dialog. Approve refetches invoices too (it flips the linked invoice
  PAID). Added `invoices.generate` + `payments.screenshot` to api-client; **fixed
  a latent bug** — `payments.reject` was sending `{ reason }` but the controller
  reads `{ note }` (Zod would have rejected it). Nav `ready: true`.
- **✅ Residents page (DONE, build-verified):** `(app)/residents/page.tsx` — one
  route, **two views via `?id=`** (list ↔ detail), Suspense-wrapped (required for
  `useSearchParams` under static export). List + **Register** dialog (jumps to the
  new resident); detail = **bed allocation** (ranked-suggestions picker /
  move-out) + **KYC documents** (verify / reject-with-note / download) +
  **security deposit** (record + **settle-exit** with dynamic deduction rows and a
  live refund preview that blocks over-deduction, mirroring the API's
  `held = Σded + refund` invariant). Nav `ready: true`.
  - **Verified (rent + residents):** `@pg/admin typecheck` + `build` (static
    export green, both pages prerendered) + `@pg/api-client typecheck`. **Live
    click-through still pending** — Docker/Postgres wouldn't boot in the sandbox;
    run the seed flow (§5) to exercise end-to-end.
- **⬜ Remaining admin pages (nav stubs, not built):** property (rooms/beds +
  edit-rent), complaints, menu, announcements, budgets, settings (branding
  editor). Flip each nav item's `ready: true` as built.
- **⬜ Committed admin frontend test** — none yet (dashboard/rent/residents are
  build- + manual-verified only). A Playwright admin e2e is a deferred follow-up.
- **⬜ Resident mobile app (Expo)** — not started.

**Recommended next sequence:** property (unlocks creating beds for the residents
allocate flow) → complaints (clears the last dashboard panel) → menu /
announcements / budgets → settings (branding editor) → then the mobile app.

### ✅ PG Owner role (multi-PG owner + manager management) — DONE, verified
A fourth role, **`PG_OWNER`**, sits between platform admin and managers: an owner
owns **multiple PGs**, creates them, and assigns/removes **managers** per PG, with
**all manager capabilities** in every owned PG. Built on the existing single-tenant
JWT + RLS — no multi-tenant JWT.
- **Two identities.** Manager actor fields (`reviewedByUserId`,
  `createdByUserId`, …) are composite FKs into `users(id, tenant_id)`, so whoever
  acts in a PG needs a real `users` row there. An owner therefore has (1) a global
  login identity — new **`owners`** table + one `auth_identities` row (role
  `PG_OWNER`, `tenant_id NULL`, email globally unique) — and (2) a **per-tenant
  `PG_OWNER` `users` row** created eagerly in each owned PG (their in-PG actor).
  **`owner_tenants`** (`ownerId, tenantId, userId`, `unique(ownerId,tenantId)`)
  maps the two. `owners`/`owner_tenants` have **NO RLS** (cross-tenant, resolved
  pre-context — like `tenants`/`auth_identities`).
- **Token-switch, JWT shape unchanged.** Owner login → *global* token
  (`tenantId null`, `sub = ownerId`). `POST /owner/pgs/:id/switch` verifies
  `owner_tenants` membership and mints a *PG-scoped* token (`sub = that PG's
  PG_OWNER user row`, `tenantId = pgId`) — so the interceptor runs `SET LOCAL`
  and the owner is mechanically a manager-plus inside the PG. No interceptor
  change.
- **One-way role hierarchy** in `RolesGuard` (`OUTRANKS`): `PG_OWNER` satisfies
  `@Roles(PG_MANAGER)` (so every manager controller just works); managers do NOT
  satisfy `@Roles(PG_OWNER)`.
- **Endpoints.** Platform: `POST /platform/owners` (super-admin creates owners).
  Owner module (`apps/api/src/owner/`): `GET/POST /owner/pgs`, `POST
  /owner/pgs/:id/switch` (global token); `GET/POST/DELETE /owner/managers`
  (PG-scoped token). Create-PG + ownership reads use `PLATFORM_DB` (BYPASSRLS,
  gated by `owner_tenants`); manager management runs under the scoped token's RLS
  context. Shared `onboarding.helpers.ts` keeps platform onboarding and
  owner-create-PG from drifting.
- **Manager removal is a soft-deactivate** (actor FKs are `NO ACTION`/RESTRICT →
  a manager who reviewed anything can't be hard-deleted, audit must survive):
  delete the `auth_identities` credential, keep the `users` row with a new
  `users.deactivated_at`. **`AuthService.refresh` re-checks the credential for
  `PG_MANAGER`** so revocation actually bites (bounded by the short access TTL,
  not the 30-day refresh TTL).
- **Admin UI** (`apps/admin`): owner login → **`/pgs` chooser** (create + open),
  PG **switch** (stashes the global token so "Switch PG" returns without
  re-login), owner-only **`/managers`** page, owner-only nav + topbar control.
- **Decisions locked:** platform-admin creates owners (no self-signup); managers
  stay **one-email-one-PG** (manager model unchanged); owners manage **only PGs
  they create** (no takeover of standalone PGs).
- **Verified:** API suite **73/73** green — new `owner.e2e-spec.ts` drives the
  full flow over HTTP (create→list→switch→manager-add/list/deactivate, **refresh
  revoked after deactivate**, cross-owner 403, one-way hierarchy 403) + RLS gate
  asserts the per-tenant `PG_OWNER` row still obeys RLS. Admin `typecheck` +
  `build` green (`/pgs` + `/managers` prerender). Live `seed-owner.mjs` against
  the running `dist` server creates an owner + 2 PGs. **Deferred:** browser
  click-through of the owner UI React glue (build- + backend-verified only,
  matching how rent/residents shipped); reactivating a deactivated manager (re-add
  inserts a fresh user row, no reactivate path yet).

Cross-cutting modules now in place: `StorageModule` (S3 presigned-URL seam,
local stub), `JobsModule` (BullMQ on Redis), `NotificationsModule` (Expo push
stub + channel abstraction). Real drivers (S3, Expo/FCM) swap in behind these
seams at deploy time.

---

## 5. How to run (local dev)

```bash
pnpm install                              # one time (also: pnpm rebuild argon2 esbuild)
pnpm infra:up                             # Postgres :5433 + Redis :6379
pnpm --filter @pg/shared build            # build shared types
pnpm db:generate                          # regenerate migration after schema changes
pnpm db:migrate                           # apply migrations + RLS policies + grants
pnpm --filter @pg/api test:isolation      # the tenant-isolation gate test
cp apps/api/.env.example apps/api/.env     # local env (gitignored)
pnpm --filter @pg/api dev                  # nest watch  (or: node --env-file=apps/api/.env apps/api/dist/main.js)
```

Health check: `GET http://localhost:4000/health`.

> Note: host port **5433** for Postgres (5432 is taken by another project's
> container on this machine). All connection strings already use 5433.

---

## 6. Conventions (keep consistent)

- **Validation**: define Zod schemas in `packages/shared`; validate in the API
  with `new ZodBody(schema)`. Don't introduce class-validator.
- **Tenant data access**: inside tenant requests, get the DB handle from
  `TenantContextService.db()` (the tenant-bound tx) and the tenant id from
  `currentTenantId()`. **Never read tenant id from the request body.** Every new
  tenant-owned table must be added to `RLS_TABLES` and gets RLS automatically via
  `src/db/migrate.ts`.
- **Platform/cross-tenant code**: only in the platform module, only via
  `PLATFORM_DB`. Never reach for the platform pool elsewhere.
- **Auth**: `@Public()` for unauthenticated routes; `@Roles(...)` for role gating;
  `@CurrentUser()` to read the JWT payload.
- **Migrations** run as `postgres`; the app never has DDL rights.

See `apps/api/CLAUDE.md` for deeper API-layer detail.
