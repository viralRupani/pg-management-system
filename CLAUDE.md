# CLAUDE.md — PG Management System

> High-level guide for any Claude session. Read first.
> Companion docs: `apps/api/CLAUDE.md` (API layer), `apps/admin/CLAUDE.md` (admin conventions), `apps/mobile/CLAUDE.md` (resident app + resident API surface), `docs/backlog.md` (open deferred items).

---

## 1. What this is

**Multi-tenant SaaS** for paying-guest (PG) hostels in Ahmedabad, India. Managers use a web dashboard (Next.js); residents use a mobile app (Expo). Each PG's data is strictly isolated via Postgres RLS.

> **Brand:** the shipped product is branded **"Basera"** (admin dashboard title/login + the `apps/landing` marketing site). The repo/workspace name (`pg-management-system`, `@pg/*` packages) is unchanged — "Basera" is customer-facing chrome, not an engineering rename.

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

**Test suite:** `pnpm --filter @pg/api test` → **269 tests / 30 files, all green** (as of 2026-07-12). Note: e2e specs that assert against "the current period" must compute it from `istPeriod(new Date())` — the harness clock is NOT frozen. `charges.e2e-spec.ts` was previously time-bombed to hardcoded `2026-06` fixtures; it now derives its periods from the real clock (see `apps/api/CLAUDE.md` gotchas).

**Scheduled invoice generation** (2026-06-27): each PG owns an optional auto-generation schedule (`invoice_schedules`, one row per tenant — day-of-month 1–28 + time, all IST). Managers create/edit/delete it on the Rent page's **Schedule** tab (`GET/PUT/DELETE /invoices/schedule`, `InvoiceScheduleService`). A single repeatable BullMQ tick (`dispatch-scheduled-invoices`, every 15 min) replaces the old fixed monthly cron: per tenant under RLS it fires `generateMonthly` when the schedule's IST moment for the current period has passed **and** it hasn't run this period (`lastRunPeriod` guard → exactly-once + catch-up after downtime). **Opt-in:** a PG with no schedule row is manual-only (the "Generate invoices" button is unchanged). On create, `initialLastRunPeriod` seeds `lastRunPeriod` only when this month's moment has already passed (so it won't back-fire for a gone day) — if the scheduled day is still ahead this month, it fires this month. **Late-join catch-up:** when a resident is registered + allocated a bed live (move-in today) *after* the PG's scheduled moment for this period has already passed, the tenant-wide run has already skipped them, so `AllocationService.allocate` bills that one resident on the spot (`InvoiceScheduleService.generateForResidentIfDue` → scoped `generateMonthly`, best-effort, does NOT stamp `lastRunPeriod`). Only fires when a schedule exists (manual PGs are untouched) and the moment is past (otherwise the normal run picks them up); idempotent, so it never double-bills alongside the dispatcher. Future-dated bookings that activate via the daily job are a separate case and not covered.

**Unified onboarding flow** (2026-06-24): registration + bed assignment both run from the residents page — the standalone `/bookings` and `/short-stays` admin pages are gone (their cancel/complete actions live on the resident profile). A resident is registered with a planned move-in date (`users.expectedMoveInDate`); the profile's assign-bed dialog (`GET /allocations/eligible-beds?residentId=`) offers vacant beds **plus** soon-to-free beds (a sitting resident's `exitRequestedDate` on/before the move-in) and dispatches: vacant + move-in today → `allocations.allocate` (live now); future move-in or a soon-to-free bed → `bookings.create` (RESERVED + UPCOMING + deposit HELD). **Short-stay guests** are now lightweight resident rows (`users.isShortStay`, registered from the same form with a check-out date + per-day charge; no OTP identity) assigned via `short-stays` to a VACANT bed (bookingId null) or a RESERVED bed whose booking move-in is after check-out (bed → TRANSIENT; terms read from the resident, not the body). They are **never given an `allocations` row**, so they are auto-excluded from both rent invoicing and ₹10/resident metering; the upfront total (days × per-day) is stored, not invoiced. Complete/cancel frees the bed via `freeBed()` and flips the guest to EXITED.

**Future-dated bed booking** (2026-06-14): the booking machinery a manager uses to hold a bed for an incoming resident before move-in (`BookingsModule`, `bookings` table). Now driven from the resident profile (see "Unified onboarding flow" above), not a standalone page. The bed shows as held (`BedStatus.RESERVED`, displayed as occupied) — not a live allocation — and the resident is `ResidentStatus.UPCOMING` with the deposit `HELD` now; no rent/metering until a daily `activate-bookings` job (also `POST /platform/jobs/activate-bookings`) creates the allocation on/after the move-in date. A bed booked while still occupied is handed to the booking when the sitting resident leaves: all three vacate paths (`settleExit`, `moveOut`, transfer old-bed release) go through `freeBed()` (`apps/api/src/db/free-bed.ts`) → RESERVED if a booking waits, else VACANT. Cancel is a true undo (frees the bed, deletes the pristine deposit).

**Post-M8 hardening** (from the 2026-06-14 backend audit, `reports/backend-audit-2026-06-14.md`): auth rate-limiting (throttler on login/OTP), OVERDUE invoices now settle on approval, `RolesGuard` fails closed when a route declares no policy, N+1 killed in `generateMonthly`, payment submission rejected on any settled invoice, `api-client` request timeout. One audit Low remains open (orphaned transfer adjustments at exit).

**Post-M8 feature work** (June–July 2026 — all built + tested, new modules in `apps/api/src/`, admin + mobile UI landed):
- **Rent proration** (`rent/rent.proration.ts`): join-month rent is prorated by active days (IST day-math); `prorateSegment` prices a mid-month room transfer's old + new room separately. `common/ist-date.ts` is now the canonical IST-calendar helper (the "toISOString off-by-one" fix both frontends describe).
- **Extra charges** (`charges/`, `extra_charges` + `invoice_charges`): manager-authored one-time / recurring-monthly charges on a resident, applied to the current open invoice now or folded by `generateMonthly` — never double-billed (see `apps/api/CLAUDE.md` "Billing folds").
- **Refer & earn** (`referrals/`, `referrals` table + `tenants.referral_discount_paise` / `referral_max_count`): a resident registered with a `referredByUserId` earns the PG's configured discount when their referral first gets allocated a bed; the discount folds into the referrer's next invoice as a negative line. Managers set the amount + an optional per-resident lifetime cap on the referrals settings.
- **Deposits: partial/installment + mid-tenancy refunds** (`deposits/`): `collect()` takes a deposit in installments (a partial at booking topped up at move-in); `refund()` returns part of a HELD deposit any time (e.g. a room downgrade), capped at the live balance. Both lock the row `FOR UPDATE`. A booking now reserves the bed even when only a partial deposit is recorded.
- **T&C gate** (`terms/`, GLOBAL no-RLS `tc_versions`/`tc_acceptances`): platform-admin publishes versioned terms; owners/managers must accept the latest before using the app. Keyed by `auth_identities.id`, fails open. See `apps/api/CLAUDE.md` "Global (no-RLS) tables".
- **Manager dashboard** (`dashboard/`): `stats()` (bed occupancy, current-month invoice breakdown, 6-month invoiced-vs-collected revenue, upcoming bookings) + a cheap `alerts()` "needs attention" feed (move-out requests, payments to review, KYC to verify, open complaints) powering the admin bell badge.
- **Transactional email** (`mail/`): `MailService` → AWS SES driver (dev logs) + compiled html/text templates; drives the manager/owner **password-reset** flow (`auth/password-reset.service.ts`, single-use Redis tokens; `forgot`/`reset`/`change-password` routes).
- **Resident lockout** (`AuthRepository.residentHasAccess`): a moved-out or settled/EXITED resident can no longer log in (checked on OTP verify + refresh).
- **UPI to pay**: managers set a UPI id / QR (on `tenants`) that residents copy; resident invoice detail shows the payment mode + proof, and an "Under review" state for a submitted-but-unapproved payment. Payment approve/reject notifies the resident.

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
