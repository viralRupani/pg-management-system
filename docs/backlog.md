# Backlog — deferred items

Collected from milestone notes. Roughly ordered by priority / dependency.

---

## Backend

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

### Mobile app (Expo) — M8, built (pending on-device verification)

Built: resident auth (slug + phone + OTP, JWT in SecureStore), tab nav, and all
feature screens (Home, Rent + invoice detail + submit-payment, Complaints + raise
+ thread, KYC documents + upload, Deposit + ledger + move-out request,
Announcements, Mess menu, Notifications feed, Profile/More + logout). `api-client`
resident methods added; NativeWind white-label theming via `GET /branding/:slug`.
Resident complaint-photo read (`GET /complaints/:id/photo`) and exit-request added
server-side. Verified by typecheck + a clean `expo export` bundle.

Still deferred:
- **On-device verification**: confirm `var(--brand)` paints + repaints on a real
  Android device (Expo Go) — see `apps/mobile/CLAUDE.md`. Not autonomously testable.
- **Real OS push**: needs an EAS dev build (Expo Go dropped Android push) +
  `expo-notifications` + swapping the server `NotificationChannel` stub for an Expo
  push driver. The in-app notifications feed works today; push-token registration
  is not wired (no token source in Expo Go).
- **Announcement push fan-out**: `NotificationsService.notify` is per-user; no
  `notifyAllResidents` broadcast helper, so a new announcement does not push.
- **Real S3 for uploads**: the storage stub URL doesn't accept the binary PUT, so
  payment/KYC/complaint-photo uploads are best-effort in dev (the key still
  persists). See Infrastructure below.

---

## Infrastructure / cross-cutting

**Real S3 driver** — `StorageModule` local stub returns non-functional `uploadUrl` (`stub-storage.local`). Logo byte-PUT and KYC upload only work against real S3.

**Payment gateway seam** — billing collection is manual (offline UPI). The `billing_snapshots` table is ready; a Razorpay/Stripe adapter plugs in without schema changes.

**Deployment** — all decisions deferred. Docker-compose is local-only; no prod infra defined.

**Committed admin e2e harness** — the API has a full committed e2e suite (`apps/api/src/e2e/`). The admin app has no equivalent yet.
