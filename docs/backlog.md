# Backlog — deferred items

Collected from milestone notes. Roughly ordered by priority / dependency.

---

## Backend

### Backend audit (2026-06-14) — `reports/backend-audit-2026-06-14.md`

Fixed since the audit: HIGH OVERDUE-can't-settle (`e53195f`), auth rate-limiting
(`37ccf17`), payment submission on any settled invoice (`d460dff`), N+1 in
`generateMonthly` (`5f82ff0`), `RolesGuard` fails closed when no `@Roles` (`91a48ff`).

**Still open (audit Low): orphaned transfer adjustments at exit**
- A mid-month room transfer queues a signed `rent_adjustments` delta consumed only
  by the next `generateMonthly`. `settleExit` never folds pending adjustments, so a
  resident who transfers then exits in the same period loses the proration delta.
- Fix: at `settleExit`, fold any unapplied `rent_adjustments` into the deposit
  settlement (or block exit while one is pending, mirroring
  `assertNoUnsettledAdjustment`). Needs a product call on exit-billing policy.

### Critical before production

**Reminder scoping** (M3 deferred) — ✅ DONE
- `sendRentReminders` now scopes to UNPAID & DUE invoices only: `status IN
  (PENDING, OVERDUE) AND due_date <= now()` (was: every PENDING invoice
  regardless of due date). Not-yet-due invoices aren't nagged; settled ones never
  are. Policy: a daily nudge while rent is due/overdue is intended for offline-UPI
  collection, so the daily cron is the cadence — no extra per-day dedup.
- Location: `JobsService.sendRentReminders`, `apps/api/src/jobs/jobs.service.ts`.

### Property / bed management

**Decommission bed** (M2 deferred)
- An out-of-service bed currently stays allocatable with no way to mark it unavailable.
- Needs: new `PATCH /property/beds/:id/status` endpoint. Must use the conditional-flip pattern (occupied → 409 before any write).
- Also deferred: **rename** buildings/floors/rooms/beds (straightforward PATCH, no guard needed).

### Resident lifecycle

**Resident-initiated exit request** (M4 deferred) — ✅ DONE (M8)
- `POST /deposits/exit-request` (resident-roled) records the request via nullable
  `exit_requested_*` columns on `users` (conditional-flip guard: ACTIVE + no
  pending request, else 409). Surfaced on `GET /deposits/mine`/`resident/:id`.
- Still open: **manager-side admin UI** to view/act on exit requests (the read is
  exposed on the deposit endpoints; the admin screen is not built).

**OVERDUE invoice transition** (M3 deferred) — ✅ DONE
- `RentService.markOverdue(period?)` bulk-flips PENDING → OVERDUE once the due
  date's IST day has fully passed (`istStartOfDayUtc` cutoff — a raw `now()`
  compare is off by 5.5h at the IST midnight boundary). Side-effect-free relabel,
  so a plain conditional UPDATE (not the 409 conditional-flip pattern).
- Driven daily @ 08:00 (before the 09:00 reminders) via the `mark-overdue`
  repeatable job; manual trigger at `POST /platform/jobs/mark-overdue`.

### Resident billing

**Extra charges** (2026-06-18) — ✅ DONE
- Manager/owner adds free-text-labelled charges to a resident — `ONE_TIME` or
  recurring `MONTHLY` (`extra_charges` definition + `invoice_charges` per-invoice
  snapshot). Applied to the resident's current open invoice immediately (skipped
  when a `SUBMITTED` payment is in flight → queued), and folded into each monthly
  generation alongside `rent_adjustments`. Remove = soft-deactivate (keeps billed
  history). Admin: resident-profile "Extra charges" card + per-invoice breakdown;
  mobile: invoice-detail breakdown. `ChargesModule`, `apps/api/src/charges/`.
- Still open (deferred):
  - **Notify the resident** when a charge is added (via the `NotificationsModule`
    stub) — not wired; push is stubbed anyway.
  - **Reverse/refund an already-applied charge** — would need a credit
    `rent_adjustment`; today remove only stops future months. Same gap covers
    **voiding an invoice that already consumed a one-time charge**: the charge's
    `appliedAt` stays stamped, so it is not re-queued onto a future invoice.

**Invoice soft-delete (void)** (2026-06-18) — ✅ DONE
- Manager voids an invoice with a mandatory reason (`invoices.deleted_at`/
  `deleted_reason`/`deleted_by_user_id`; conditional-flip guard → 409 on
  double-delete). A voided invoice is no longer owed: `submitPayment` rejects it,
  `markOverdue` skips it, and it drops out of billed/paid totals + extra-charge
  apply-now — but it stays in every list (greyed, with the reason). `RentService.
  deleteInvoice`, `POST /invoices/:id/delete`. Admin: delete button + confirm
  modal (required reason) on both the Rent invoices tab and the resident profile;
  mobile shows a "Cancelled" state + reason and hides Pay.
- Still open (deferred): **no un-delete / restore** path — voiding is one-way in
  the UI (a mis-void needs a DB fix or re-generation). Add `POST /invoices/:id/
  restore` if managers need it.

### Owner/manager management

**Manager reactivation** (PG Owner deferred)
- Deactivating a manager deletes their `auth_identities` row and sets `users.deactivated_at`.
- Re-adding creates a fresh `users` row — no explicit reactivate path for the old one.
- Consider: a `POST /owner/managers/:id/reactivate` endpoint.

---

## Frontend

### Admin (Next.js)

**Committed Playwright e2e** (M7 deferred)
- Admin pages are build-verified + manual click-through only (no committed automated test).
- A `apps/admin/e2e/` Playwright suite is the missing safety net.

**Bed rename + decommission UI** (property page, M2/M7 deferred)
- `apps/admin/app/(app)/property/page.tsx` has create + edit-rent but no rename or decommission affordance.
- Blocked on the backend endpoint above.

### Mobile app (Expo) — M8, built + device-verified

Done: resident auth (slug + phone + OTP, JWT in SecureStore), swipeable tab nav,
and all feature screens (Home with floating rent card, Rent + invoice detail +
submit-payment, Complaints + raise + thread, KYC documents + upload, Deposit +
ledger + move-out request, Announcements, Mess menu, Notifications feed,
Profile/More + logout). `api-client` resident methods added; NativeWind white-label
theming via `GET /branding/:slug` (paints/repaints, persists cold start).
Resident complaint-photo read (`GET /complaints/:id/photo`) and exit-request added
server-side. Verified by typecheck, a clean `expo export` bundle, **and a run in
Expo Go on a physical Android phone** (`var(--brand)` confirmed on native).

Still deferred:
- **Real OS push**: needs an EAS dev build (Expo Go dropped Android push) +
  `expo-notifications` + swapping the server `NotificationChannel` stub for an Expo
  push driver. The in-app notifications feed works today; push-token registration
  is not wired (no token source in Expo Go).
- **Announcement push fan-out**: `NotificationsService.notify` is per-user; no
  `notifyAllResidents` broadcast helper, so a new announcement does not push.
- **Real S3 for uploads**: the storage stub URL doesn't accept the binary PUT, so
  payment/KYC/complaint-photo uploads are best-effort in dev (the key still
  persists). See Infrastructure below.

### Auth security

**Refresh-token invalidation after password change** (deferred from password-change / forgot-password feature, 2026-06-16)
- Changing or resetting a password does **not** invalidate existing refresh tokens.
  Stateless 30-day JWTs stay valid after a reset, so a compromised session survives
  a password change (gap window = up to 30 days).
- Fix: add a `passwordChangedAt` (or monotone `tokenVersion integer`) column to
  `auth_identities`. On `AuthService.refresh`, compare `token.iat` against
  `passwordChangedAt` (or check `tokenVersion` embedded in the JWT claim) and throw
  if the token predates the most recent password change.
- Same `auth_identities` table, no RLS implications. Requires a migration and
  updating `issueTokens` to embed the version / `AuthRepository.refresh` to verify it.

---

## Infrastructure / cross-cutting

**Real S3 driver** — `StorageModule` local stub returns non-functional `uploadUrl` (`stub-storage.local`). Logo byte-PUT and KYC upload only work against real S3.

**Payment gateway seam** — billing collection is manual (offline UPI). The `billing_snapshots` table is ready; a Razorpay/Stripe adapter plugs in without schema changes.

**Deployment** — all decisions deferred. Docker-compose is local-only; no prod infra defined.

**Committed admin e2e harness** — the API has a full committed e2e suite (`apps/api/src/e2e/`). The admin app has no equivalent yet.
