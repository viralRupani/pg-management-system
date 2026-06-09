# Backlog — deferred items

Collected from milestone notes. Roughly ordered by priority / dependency.

---

## Backend

### Critical before production

**Reminder scoping** (M3 deferred)
- `sendRentReminders(undefined)` notifies on *every* PENDING invoice regardless of month. The daily repeatable job passes no period, so an old unpaid invoice re-notifies every day.
- Fix: scope reminders to the current/overdue period, or dedup per `(residentId, period)` per day.
- Location: `JobsService.sendRentReminders`, `apps/api/src/jobs/jobs.service.ts`.

### Property / bed management

**Decommission bed** (M2 deferred)
- An out-of-service bed currently stays allocatable with no way to mark it unavailable.
- Needs: new `PATCH /property/beds/:id/status` endpoint. Must use the conditional-flip pattern (occupied → 409 before any write).
- Also deferred: **rename** buildings/floors/rooms/beds (straightforward PATCH, no guard needed).

### Resident lifecycle

**Resident-initiated exit request** (M4 deferred)
- Only manager-driven `POST /deposits/exit` exists.
- Add: `POST /deposits/exit-request` (resident) that records intent and notifies managers, to be built in M8.

**OVERDUE invoice transition** (M3 deferred)
- Invoices stay PENDING past `due_date`.
- Add a scheduled job or flag to flip PENDING → OVERDUE when `due_date` has passed.

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

### Mobile app (Expo) — M8, not started

All of the following are pending the Expo build:

- **Resident auth**: slug + phone + OTP login, JWT in `SecureStore`.
- **Resident exit request**: `POST /deposits/exit-request` UI.
- **Resident-facing complaint photo**: `GET /complaints/:id/photo` (manager endpoint exists; resident endpoint not yet added).
- **Announcement push fan-out**: `NotificationsService.notify` is per-user; no `notifyAllResidents` broadcast helper. Wire `POST /announcements` → fan-out in M8 or add the helper first.
- **`api-client` resident methods**: only manager-surface methods exist; add resident-facing counterparts.
- **NativeWind theming**: accent-color theming via the `GET /branding/:slug` public endpoint (pre-auth, keyed by slug — unlike the manager app which uses `GET /tenants/branding` post-login).
- **Expo/FCM push stub → real driver**: swap `NotificationChannel` stub for real Expo push at deploy time.

---

## Infrastructure / cross-cutting

**Real S3 driver** — `StorageModule` local stub returns non-functional `uploadUrl` (`stub-storage.local`). Logo byte-PUT and KYC upload only work against real S3.

**Payment gateway seam** — billing collection is manual (offline UPI). The `billing_snapshots` table is ready; a Razorpay/Stripe adapter plugs in without schema changes.

**Deployment** — all decisions deferred. Docker-compose is local-only; no prod infra defined.

**Committed admin e2e harness** — the API has a full committed e2e suite (`apps/api/src/e2e/`). The admin app has no equivalent yet.
