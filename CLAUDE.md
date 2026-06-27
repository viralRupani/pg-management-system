# CLAUDE.md — PG Management System

> High-level guide for any Claude session. Read first.
> Companion docs: `apps/api/CLAUDE.md` (API layer), `apps/admin/CLAUDE.md` (admin conventions), `apps/mobile/CLAUDE.md` (resident app + resident API surface), `docs/backlog.md` (open deferred items).

---

## 1. What this is

**Multi-tenant SaaS** for paying-guest (PG) hostels in Ahmedabad, India. Managers use a web dashboard (Next.js); residents use a mobile app (Expo). Each PG's data is strictly isolated via Postgres RLS.

- **Pricing:** ₹10/active resident/month ("active" = bed-allocated). Manual collection (offline UPI); metered in-app via `billing_snapshots`.
- **No payment gateway:** residents upload a screenshot, manager approves/rejects.

---

## 2. Locked decisions

| Decision | Choice | Note |
|---|---|---|
| Tenant isolation | Shared Postgres + RLS | Cheapest at ₹10/resident economics |
| Mobile | React Native + Expo (TypeScript) | One codebase Android+iOS |
| Web admin | Next.js `output:'export'` — pure client SPA | No SSR/middleware — API is the only trust boundary |
| Backend | NestJS + Drizzle ORM | Drizzle needed for explicit `SET LOCAL` control |
| Auth | Phone OTP (residents); email+password (managers) | Resident login = slug + phone + OTP |
| Resident phone uniqueness | Per-tenant | People move between PGs |
| Notifications | Expo/FCM push (stub); SMS/email deferred | Behind a channel abstraction |
| File storage | AWS S3 presigned URLs | KYC, payments, complaints, logos |
| Currency | Integer paise everywhere | No floats, ever |
| Platform billing | Manual collection; meter headcount in-app | Gateway seam left for later |

---

## 3. Architecture

**Monorepo** (pnpm workspaces + Turborepo):

```
apps/api/          NestJS backend — the ONLY server (auth, RLS, business logic)
apps/admin/        Next.js manager dashboard (static export — all pages done)
apps/mobile/       Expo resident app (feature-complete, device-verified)
apps/resident-web/ Next.js resident web app (static export, installable PWA) —
                   replica of apps/mobile for iPhone users; see its CLAUDE.md
packages/shared/   Zod schemas + enums — single source of truth for all surfaces
packages/api-client/ Typed fetch client (ships TS source; no build step)
infra/             docker-compose: Postgres 16 on :5433, Redis 7 on :6379
```

### Tenant isolation — 5 layers (do not weaken any)

1. **Postgres RLS** on every tenant table (listed in `RLS_TABLES`, `apps/api/src/db/schema/index.ts`). Both `USING` and `WITH CHECK` — unset context → NULL → fail-closed (zero rows).
2. **`SET LOCAL` per request**: `TenantContextService.run()` opens a transaction, sets `app.current_tenant_id` transaction-locally via `AsyncLocalStorage`. **Tenant id comes ONLY from the JWT — never request input.**
3. **DB role split**: `app_user` (NOBYPASSRLS) for all tenant requests; `platform_user` (BYPASSRLS) for platform module only; `postgres` for migrations only.
4. **Composite FKs carry `tenant_id`**: every parent has `unique(id, tenant_id)`; every child references `(parent_id, tenant_id)`. A cross-tenant reference is unrepresentable at the schema level — Postgres FK checks bypass RLS, so the FK itself must carry the tenant.
5. **App-layer ownership within a tenant**: RLS isolates tenants, NOT residents within one. Every resident-facing endpoint derives the actor id from JWT `sub`; manager-set fields (`reviewedByUserId`, etc.) come from `sub` too — never the request body.

`tenants` and `auth_identities` have **no RLS** (login must work before context exists). Read via `app_user` pool only — blast radius is contact+credential only.

### Cross-cutting modules (real drivers swap in at deploy time)
- `StorageModule` — S3 presigned-URL seam (local stub in dev; always store key, presign on read)
- `JobsModule` — BullMQ on Redis (per-PG scheduled invoice dispatch + daily reminders)
- `NotificationsModule` — Expo push stub + `NotificationChannel` abstraction

### PG Owner role
`PG_OWNER` sits between platform admin and managers: owns multiple PGs, assigns managers, has all manager capabilities in owned PGs. Implemented via token-switch (`POST /owner/pgs/:id/switch`) — global token → PG-scoped token, no interceptor change. One-way role hierarchy: `PG_OWNER` satisfies `@Roles(PG_MANAGER)` but not vice versa. Manager removal is soft-deactivate (audit FKs survive; `AuthService.refresh` re-checks credential so revocation bites on next refresh).

---

## 4. Status

**All API milestones, the admin frontend, and the M8 resident mobile app are built and verified.** The Expo app is feature-complete (OTP auth, bottom-tab nav with swipe, every resident screen) and **device-verified in Expo Go** on a physical Android phone — `var(--brand)` white-label theming paints + repaints, and the accent persists across cold start. Its resident backend gaps (`POST /deposits/exit-request`, resident-scoped complaint-photo read) are implemented and tested. See `apps/mobile/CLAUDE.md` for the directory map, run commands, resident API surface, and what's still deferred (real OS push, announcement fan-out, real S3).

| Milestone | Status | Key additions |
|---|---|---|
| M1 Foundation | ✅ | `tenants`, `auth_identities`, `users`; auth, RLS, platform onboarding |
| M2 Property | ✅ | `buildings→floors→rooms→beds`, `allocations`; PropertyModule, AllocationModule |
| M3 Rent | ✅ | `invoices`, `payments`; RentService, BullMQ jobs, NotificationsModule |
| M4 KYC + Deposits | ✅ | `documents`, `deposits`, `deposit_transactions`; exit settlement |
| M5 Operations | ✅ | `complaints`+updates, `menu_items`, `announcements`, `budgets`, `expenses` |
| M6 Metering + Branding | ✅ | `billing_snapshots`; MeteringService, BrandingModule |
| M7 Admin frontend | ✅ | All 8 pages + `packages/api-client`; owner/manager UI |
| PG Owner role | ✅ | `owners`, `owner_tenants`; token-switch, manager deactivation |
| M8 Resident mobile | ✅ | Expo app, **device-verified**: OTP auth + swipe tabs + all resident screens (rent/payments, complaints, KYC, deposit + move-out, announcements, mess, notifications, profile). `api-client` resident methods + NativeWind white-label (`var(--brand)` paints/repaints, persists cold start). See `apps/mobile/CLAUDE.md` |

**Test suite:** `pnpm --filter @pg/api test` → **237 tests / 25 files, all green** (as of 2026-06-27).

**Scheduled invoice generation** (2026-06-27): each PG owns an optional auto-generation schedule (`invoice_schedules`, one row per tenant — day-of-month 1–28 + time, all IST). Managers create/edit/delete it on the Rent page's **Schedule** tab (`GET/PUT/DELETE /invoices/schedule`, `InvoiceScheduleService`). A single repeatable BullMQ tick (`dispatch-scheduled-invoices`, every 15 min) replaces the old fixed monthly cron: per tenant under RLS it fires `generateMonthly` when the schedule's IST moment for the current period has passed **and** it hasn't run this period (`lastRunPeriod` guard → exactly-once + catch-up after downtime). **Opt-in:** a PG with no schedule row is manual-only (the "Generate invoices" button is unchanged). On create, `initialLastRunPeriod` seeds `lastRunPeriod` only when this month's moment has already passed (so it won't back-fire for a gone day) — if the scheduled day is still ahead this month, it fires this month.

**Unified onboarding flow** (2026-06-24): registration + bed assignment both run from the residents page — the standalone `/bookings` and `/short-stays` admin pages are gone (their cancel/complete actions live on the resident profile). A resident is registered with a planned move-in date (`users.expectedMoveInDate`); the profile's assign-bed dialog (`GET /allocations/eligible-beds?residentId=`) offers vacant beds **plus** soon-to-free beds (a sitting resident's `exitRequestedDate` on/before the move-in) and dispatches: vacant + move-in today → `allocations.allocate` (live now); future move-in or a soon-to-free bed → `bookings.create` (RESERVED + UPCOMING + deposit HELD). **Short-stay guests** are now lightweight resident rows (`users.isShortStay`, registered from the same form with a check-out date + per-day charge; no OTP identity) assigned via `short-stays` to a VACANT bed (bookingId null) or a RESERVED bed whose booking move-in is after check-out (bed → TRANSIENT; terms read from the resident, not the body). They are **never given an `allocations` row**, so they are auto-excluded from both rent invoicing and ₹10/resident metering; the upfront total (days × per-day) is stored, not invoiced. Complete/cancel frees the bed via `freeBed()` and flips the guest to EXITED.

**Future-dated bed booking** (2026-06-14): the booking machinery a manager uses to hold a bed for an incoming resident before move-in (`BookingsModule`, `bookings` table). Now driven from the resident profile (see "Unified onboarding flow" above), not a standalone page. The bed shows as held (`BedStatus.RESERVED`, displayed as occupied) — not a live allocation — and the resident is `ResidentStatus.UPCOMING` with the deposit `HELD` now; no rent/metering until a daily `activate-bookings` job (also `POST /platform/jobs/activate-bookings`) creates the allocation on/after the move-in date. A bed booked while still occupied is handed to the booking when the sitting resident leaves: all three vacate paths (`settleExit`, `moveOut`, transfer old-bed release) go through `freeBed()` (`apps/api/src/db/free-bed.ts`) → RESERVED if a booking waits, else VACANT. Cancel is a true undo (frees the bed, deletes the pristine deposit).

**Post-M8 hardening** (from the 2026-06-14 backend audit, `reports/backend-audit-2026-06-14.md`): auth rate-limiting (throttler on login/OTP), OVERDUE invoices now settle on approval, `RolesGuard` fails closed when a route declares no policy, N+1 killed in `generateMonthly`, payment submission rejected on any settled invoice, `api-client` request timeout. One audit Low remains open (orphaned transfer adjustments at exit).

**Critical open items** (see `docs/backlog.md` for the full list):
- **Decommission bed** — needs a new API endpoint (conditional-flip pattern; occupied bed → 409).
- **Orphaned transfer adjustments at exit** — a mid-month transfer's pending `rent_adjustments` delta is dropped if the resident exits before the next monthly run.

---

## 5. How to run

```bash
pnpm install                              # one-time setup
pnpm infra:up                             # Postgres :5433 + Redis :6379
pnpm --filter @pg/shared build            # build shared types
pnpm db:migrate                           # apply migrations + RLS policies + grants
cp apps/api/.env.example apps/api/.env    # (gitignored)
pnpm --filter @pg/api dev                 # API on :4000
node apps/api/scripts/seed-demo.mjs       # seed "Sunrise PG" (manager@sunrise.pg / password123)
```

Health check: `GET http://localhost:4000/health`.  
Postgres on port **5433** (5432 taken by another project's container).

---

## 6. Conventions

- **Validation**: Zod schemas in `packages/shared`; `new ZodBody(schema)` in API. No class-validator.
- **Tenant DB access**: `TenantContextService.db()` + `currentTenantId()`. Never read tenant id from the request body. Add every new tenant-owned table to `RLS_TABLES`.
- **Platform / cross-tenant**: platform module only, via `PLATFORM_DB`. Never elsewhere.
- **Auth decorators**: `@Public()` for unauthenticated routes; `@Roles(...)` for role gating; `@CurrentUser()` to read the JWT payload.
- **Migrations**: run as `postgres`; the app never has DDL rights. Run `pnpm db:generate` after schema changes.
- **Currency**: integer paise. No floats anywhere.
- **Status transitions with side effects**: conditional flip + rows-affected check FIRST, not select-then-update. Guard on the always-present entity (e.g. resident status, not the optional deposit).
- **Storage keys**: always store S3 key, never a raw URL. Presign on every read response.
- **Actor fields**: always derive from JWT `sub` (manager user id or resident id), never from the request body.

See `apps/api/CLAUDE.md` for deeper API-layer conventions.
