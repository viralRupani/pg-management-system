# Backend Audit — 2026-06-14

## Resolution status (updated 2026-06-14, post-audit)

Three findings were fixed in this same session (on `main`); the original
findings below are kept verbatim for the audit trail.

- ✅ **[HIGH] OVERDUE invoices can never be approved/paid** — fixed in `e53195f`:
  `reviewPayment` now settles on `status IN (PENDING, OVERDUE)`. Regression e2e
  added.
- ✅ **[MEDIUM] No rate limiting on auth endpoints** — fixed in `37ccf17`:
  `@nestjs/throttler` on `AuthController` (login 5/min, otp/request 3/min,
  otp/verify 5/min; refresh unthrottled; skipped under `NODE_ENV=test`).
- ✅ **[LOW] `submitPayment` blocks only PAID, not WAIVED** — fixed: submission is
  now gated on payable states (`PENDING`/`OVERDUE`), rejecting any settled
  invoice. (WAIVED has no producing endpoint yet, so this is correct hardening /
  future-proofing; the reachable PAID → 409 contract is unchanged.)

Still open: the three Low findings below (orphaned transfer adjustments at exit,
N+1 in `generateMonthly`, routes without `@Roles` falling through) plus the
backlog items.

## Summary

The backend is in good health. The five-layer tenant-isolation model holds, the
load-bearing concurrency patterns (conditional-flip-then-side-effect) are applied
consistently, money is integer paise everywhere, and actor identity is always
derived from the JWT `sub`. The most security-sensitive route in the system — the
PG-owner cross-tenant token mint (`switchPg`) — correctly verifies `owner_tenants`
membership before issuing a scoped token.

The **headline finding is a regression introduced by the new OVERDUE feature**
(commit `da0e0ae`): once an unpaid invoice flips PENDING → OVERDUE, a manager can
no longer approve the resident's payment for it — the approval path still guards
the settle on `status = PENDING`, so it 409s and rolls back, leaving the paid
invoice stuck OVERDUE forever. This breaks the core money-collection workflow for
exactly the late-payers it was built to track, and the 135 green tests don't cover
it. That's a self-contained one-line fix; I swept every other `InvoiceStatus`
reference and confirmed this is the **only** place that treats PENDING as "the
unpaid state" without including OVERDUE (settle-exit, reminders, and list-ordering
all handle OVERDUE correctly).

On the positive side, the previously-backlogged **reminder-scoping bug is now
fixed** — `sendRentReminders` scopes to `status IN (PENDING, OVERDUE) AND
due_date <= now()` instead of nagging every PENDING invoice daily.

- **Counts:** Critical: 0 · High: 1 · Medium: 1 · Low: 4

## Test suite

`pnpm --filter @pg/api test` (infra up: Postgres :5433 + Redis :6379, migrated).
**135 passed / 135 total, 13 suites, all green.** Coverage gap noted below: the
approve-payment-on-OVERDUE path has no test, which is why the High finding shipped.

## Findings

### [HIGH] OVERDUE invoices can never be approved/paid — late rent is uncollectable in-app
- **Where:** `apps/api/src/rent/rent.service.ts:470-482` (`reviewPayment`, the
  approve branch).
- **What:** The authoritative single-settle guard flips the invoice
  `WHERE id = ? AND status = PENDING`. The OVERDUE transition
  (`markOverdue`, `rent.service.ts:198`) moves past-due unpaid invoices
  PENDING → OVERDUE. `submitPayment` only blocks `status === PAID`
  (`rent.service.ts:333`), so a resident can still submit a payment against an
  OVERDUE invoice. But when the manager approves it, the `status = PENDING` guard
  matches 0 rows → `ConflictException("Invoice is already paid")` → the whole
  transaction (including the payment's SUBMITTED → APPROVED flip in step 1) rolls
  back. The payment stays SUBMITTED and the invoice stays OVERDUE permanently.
- **Impact:** Every resident who pays after the due date cannot have their payment
  recorded. The invoice the manager most needs to clear (overdue rent) is the one
  that can never be marked paid. No data loss/leak, but the core collection
  workflow is broken for late payers — the exact population OVERDUE was added for.
- **Fix:** Include OVERDUE in the settle guard:
  ```ts
  .where(and(
    eq(invoices.id, decided[0].invoiceId),
    inArray(invoices.status, [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
  ))
  ```
  This still excludes PAID/WAIVED, so the "an invoice can never carry two APPROVED
  payments" invariant is preserved. Add an e2e case: mark an invoice OVERDUE, submit
  + approve a payment, assert it settles to PAID.
- **Confidence:** Confirmed by reading the code and the InvoiceStatus enum
  (`packages/shared/src/enums.ts:59-62`); reproduced the logic by hand and confirmed
  no test exercises it.

### [MEDIUM] No rate limiting on manager login or OTP issuance (brute-force / SMS-bombing)
- **Where:** `apps/api/src/auth/auth.controller.ts` → `managerLogin`
  (`auth.service.ts:29`) and `requestOtp` (`auth.service.ts:48`). No
  `@nestjs/throttler` or equivalent is registered anywhere (`main.ts`,
  `security.module.ts`).
- **What:** OTP *verification* is correctly capped (5 wrong tries burns the code,
  `otp.service.ts:75`), but there is no limit on (a) manager password attempts —
  unlimited argon2 guesses against a known email — or (b) OTP *issuance* — an
  attacker who knows a `slug`+`phone` can trigger unbounded OTP sends (real SMS
  cost / harassment once `SmsProvider` is live).
- **Impact:** Online password brute-force on manager accounts; SMS-bomb / cost
  amplification once SMS is wired. Blast radius is bounded by argon2 cost and the
  per-tenant phone scope, hence Medium not High.
- **Fix:** Add `@nestjs/throttler` with a strict per-IP+route limit on the three
  auth endpoints (e.g. login 5/min, otp/request 3/min, otp/verify 5/min as
  defense-in-depth on top of the existing code burn).
- **Confidence:** Confirmed — no throttling module is imported anywhere in the API.

### [LOW] Unapplied rent adjustments are orphaned when a resident exits before their next invoice
- **Where:** `apps/api/src/deposits/deposits.service.ts` (`settleExit`) vs.
  `apps/api/src/allocation/allocation.service.ts:519` (transfer queues a signed
  `rent_adjustments` row consumed only by the next `generateMonthly`).
- **What:** A mid-month room transfer queues an unapplied `rent_adjustments` delta
  (credit or debit) that is folded into the resident's *next* generated invoice.
  `settleExit` settles the deposit, frees the bed, and marks EXITED but never
  generates a final invoice or consumes pending adjustments — so if the resident
  exits before the next monthly run, the transfer delta is never billed/credited.
- **Impact:** Small money-correctness gap at exit (the proration delta for the
  transfer month is silently dropped). Bounded to residents who transfer then exit
  in the same period; amounts are sub-month prorations.
- **Fix:** At `settleExit`, fold any unapplied `rent_adjustments` for the resident
  into the deposit settlement (or block exit while one is pending, mirroring
  `assertNoUnsettledAdjustment`).
- **Confidence:** Confirmed by reading both services; needs a product call on the
  intended exit-billing policy.

### [LOW] `submitPayment` blocks only PAID, not WAIVED
- **Where:** `apps/api/src/rent/rent.service.ts:333`.
- **What:** A resident can submit a payment against a WAIVED invoice (only PAID is
  blocked). Approval then fails the `status = PENDING` settle guard with a 409, so
  no money moves, but it lets dead SUBMITTED rows pile onto a settled-by-waiver
  invoice.
- **Fix:** Block submission on any settled status: `if (invoice.status !==
  InvoiceStatus.PENDING && invoice.status !== InvoiceStatus.OVERDUE) throw ...`.
- **Confidence:** Confirmed; minor.

### [LOW] N+1 in `generateMonthly` adjustment folding
- **Where:** `apps/api/src/rent/rent.service.ts:135-182`.
- **What:** Per inserted invoice, a separate SELECT + UPDATE of `rent_adjustments`
  runs in a loop. Bounded (monthly batch, one tenant at a time, only residents with
  pending adjustments), so not a scale risk today, but it grows linearly with active
  residents on the cron's critical section.
- **Fix:** Batch the pending-adjustment read for all inserted resident ids in one
  query and group in memory; optional.
- **Confidence:** Confirmed; low impact.

### [LOW] Routes without `@Roles` fall through to "any authenticated user"
- **Where:** `apps/api/src/common/roles.guard.ts:38` — empty/absent `@Roles`
  returns `true`.
- **What:** A controller method that forgets `@Roles` (and isn't `@Public`) is
  reachable by any authenticated principal, including a RESIDENT token on a manager
  surface. Every controller audited sets `@Roles` (mostly at class level), so this
  is latent, not active — a defense-in-depth footgun as new routes are added.
- **Fix:** Consider defaulting to deny when no `@Roles` is present, or a lint/test
  that asserts every non-`@Public` handler declares a role.
- **Confidence:** Confirmed by reading the guard; no live violation found.

## Still-open known issues (re-confirmed, one line each)
- **Decommission bed:** still no endpoint to mark a bed out-of-service (backlog).
- **Manager reactivation:** still no reactivate path for a deactivated manager.
- **OVERDUE transition:** implemented (`markOverdue`) — but see the High finding it
  introduced in the approve path.
- **Reminder scoping:** **now FIXED** — `sendRentReminders` scopes to due+unpaid
  invoices (`jobs.service.ts:59-90`); no longer re-nags every PENDING daily.

## Checked and OK
- **Owner cross-tenant token mint:** `switchPg` (`owner.service.ts:186-201`) verifies
  `owner_tenants` membership before minting a PG-scoped token — no bypass; an owner
  cannot mint a token for a UUID they don't own.
- **RLS table coverage:** every tenant-owned schema file is in `RLS_TABLES`; the new
  `transfer_requests` and `rent_adjustments` are both present. Only
  `tenants`/`auth_identities`/`owners`/`owner_tenants` are absent — all by design.
- **Role hierarchy:** `RolesGuard` is one-way (`PG_OWNER` outranks `PG_MANAGER`
  only); a manager cannot reach `@Roles(PG_OWNER)` routes.
- **Money units:** all currency columns are integer `*_paise`; no float/numeric/
  decimal money column or float arithmetic on stored money. (The reminder body
  formats `amountPaise / 100` for display text only — not persisted.)
- **Actor identity / intra-tenant ownership:** invoices, payments, documents,
  complaints, deposits all derive the resident/reviewer id from JWT `sub` and scope
  owned reads by it; manager-set fields (`reviewedByUserId`, `createdByUserId`,
  `authorUserId`) come from `sub`, never the body.
- **Concurrency / state transitions:** conditional-flip-then-side-effect applied in
  `reviewPayment` (payment step), `documents.review`, `settleExit`, `requestExit`,
  and transfer execute/cancel; double-booking guarded by partial-unique indexes on
  `allocations` with unique-violation → 409 mapping.
- **OTP brute-force:** 6-digit code capped at 5 wrong attempts then burned
  (`otp.service.ts`); CSPRNG (`randomInt`) not `Math.random`.
- **Secrets / config:** JWT secrets required (min length) via Zod env validation;
  `OTP_DEV_LOG` and `OTP_DEV_FIXED_CODE` force-disabled in production regardless of
  env; no hardcoded secrets; CORS origins from env.
- **Background jobs:** `forEachTenant` lists tenant ids via the platform read then
  runs each tenant's work under RLS context on the app pool, each wrapped in its own
  try/catch — no cross-bill, one failure doesn't abort the batch.
