# Pre-production readiness — 2026-08-02

Method: every open item in `docs/backlog.md`, both `docs/PRODUCTION.md` blockers, and
every line of `todo.txt` was checked **against the code**, not taken from the doc.
Each verdict below carries the `file:line` it was verified at. Full workspace
typecheck and the API test suite were run.

**Build health**

| Check | Result |
|---|---|
| `pnpm -r typecheck` (7 workspaces) | ✅ all green |
| `pnpm --filter @pg/api test` | ⚠️ **296 passed / 1 failed** (33 suites, 1 failing) |

---

## 1. Hard blockers — the *resident* product does not work without these

> **The manager-side product is shippable today.** Managers and owners authenticate
> with email + password and are untouched by both blockers below. Onboarding a first
> PG where managers run everything and residents don't yet use the app is a real
> launch option — the blockers gate the resident app, not the dashboard.

### 1a. No SMS provider → **residents literally cannot log in**
`apps/api/src/auth/otp.service.ts:14` declares `interface SmsProvider`; nothing
implements it and nothing injects it. `OtpService.issue()` (line 42) writes the code
to Redis and returns — the only delivery path is `if (this.env.OTP_DEV_LOG)` at
line 56, and `OTP_DEV_LOG` / `OTP_DEV_FIXED_CODE` are **force-cleared under
`NODE_ENV=production`** (`config/env.ts:163-165`). In production the OTP request
returns `200 OK` and the resident receives nothing. Silent failure — no error to
debug from.

Fix: implement an MSG91 (India) or Twilio driver, re-add `+91` inside the driver
(we store bare 10-digit numbers), and inject it into `issue()`. Managers/owners
(email+password) are unaffected — **the manager-side product ships without this**;
the resident app does not.

### 1b. SES must be live, or nothing reaches a resident — **fix this before 1a**
Since 2026-07-24 email is mandatory for long-term residents and must be
OTP-verified before a bed can be allocated or booked (`assertEmailVerified()` at
`AllocationService.allocate` / `BookingsService.create`). The code is delivered by
`MailService.sendOtpEmail` (`mail/mail.service.ts:51`) and there is no other
delivery path. With `SES_FROM_EMAIL` unset the app boots on `ConsoleEmailStub`
(`mail/email-provider.ts:32`) — and note `mail.module.ts:28` selects the stub
purely on `SES_FROM_EMAIL`, with **no `NODE_ENV` guard**, unlike the OTP dev-log.

So the precise severity: the stub *does* log the full text body in production, so a
manager could in principle read verification codes out of the server log. Not a
permanent dead end — but unusable as a workflow, **and it means every
verification code and every password-reset link sits in plaintext logs.** Treat an
SES-less production boot as both broken and a credential leak.

This is configuration, not code: set `SES_FROM_EMAIL` + credentials, verify the
sending identity, and **get out of the SES sandbox** (sandbox only sends to
pre-verified addresses — that alone breaks resident onboarding).
`config/env.ts:132` fails the boot fast on a *half*-configured SES, but does **not**
fail when SES is absent entirely.

> **Ordering:** SES is upstream of SMS. A resident needs the emailed OTP to get a
> bed at all; the SMS OTP only matters for a resident who already has one. Do 1b
> first.

---

## 2. Should fix before launch

### 2a. Red test: `documents-deposits.e2e-spec.ts:253` — time-bombed fixture
`Expected 1, received 0`. The spec generates invoices for a hardcoded `"2026-07"`
while its residents are allocated at *run time* (line 61-63, i.e. today, Aug 2026),
so nobody is billable in July. **Not a product regression** — it is the exact bug
class `CLAUDE.md` already warns about and that `charges.e2e-spec.ts` was fixed for
in `5a95079`. Fix the same way: derive the period from `istPeriod(new Date())`.
*Diagnosed from the fixture, not proven by a re-run with a corrected period* — do
the fix and confirm, don't assume it's benign.

Same latent time-bomb, not yet firing: `deposit-apply-rent.e2e-spec.ts:68-194`
and `deposit-update-amount.e2e-spec.ts:67-79` hardcode `2026-06`…`2026-09` with
hardcoded `startDate`s, so they are self-consistent for now but will rot.

### 2b. `trust proxy` not set — rate limiting is effectively disabled
`apps/api/src/main.ts` has no `app.getHttpAdapter().getInstance().set("trust proxy", 1)`.
Behind Caddy every client keys to the proxy IP → one shared throttle bucket, so
brute-force protection on login/OTP/email-verify does not work per-client. One line.

### 2c. `apps/mobile` move-out is a real billing gap (not cosmetic)
`apps/mobile/app/deposit.tsx:38,45` still submits an **exact day**
(`requestedDate: ymd(date)`), and renders a single flat state (line 141). But the
server semantics since 2026-07-14 skip billing for the resident's **entire exit
month**. A mobile resident who picks the 15th gets that whole month unbilled — real
revenue loss. Mobile also never sees the pending/approved tiers or
`bookingConflict`. `apps/resident-web/app/(app)/deposit/page.tsx` was updated
(month-only picker + 5 states); mobile was intentionally left behind and is now
out of sync.

### 2d. Decommission a bed — endpoint does not exist
`PATCH /property/beds/:id` is a **rename only** (`property.controller.ts:115` →
`renameBed`). `BedStatus` (`packages/shared/src/enums.ts:54`) has only
`VACANT | OCCUPIED | RESERVED | TRANSIENT` — there is no out-of-service state at
all, so an unusable bed stays allocatable. Needs the enum value + endpoint
(conditional-flip; occupied → 409) + the admin affordance.

### 2e. No `helmet` / security headers
No `helmet` dependency or usage anywhere in `apps/api`. Add it in `main.ts`
alongside the `trust proxy` line.

---

## 3. Known-accepted gaps (ship-with, document them)

| Gap | Verified | Impact |
|---|---|---|
| **Orphaned transfer adjustments at exit** — `settleExit` (`deposits.service.ts:806`) never folds pending `rent_adjustments` | no `adjustment` reference anywhere in the function | Transfer-then-exit in the same period silently loses the proration delta. Priority is raised now that auto-transfers create these with no manager in the loop. |
| **Password change does not invalidate refresh tokens** | no `passwordChangedAt` / `tokenVersion` anywhere in `apps/api/src` | A compromised session survives a password reset for up to 30 days. |
| **No manager reactivation** | no `reactivate` route in `apps/api/src` | Re-adding a deactivated manager creates a fresh `users` row. |
| **No invoice un-void / restore** | no `restore` in `apps/api/src/rent` | A mis-voided invoice needs a DB fix. |
| **No charge reversal/refund** | — | Removing a charge only stops future months. |
| **Real OS push not wired** | — | Mitigated by email as a second channel for every feed row — **but only if SES is live (§1b)**. Without SES there is no notification delivery at all. |
| **No admin e2e suite** | `apps/admin/e2e` does not exist | Admin is build-verified + manual click-through only. The API has a full committed e2e suite. |

---

## 4. Backlog corrections — items marked open that are actually shipped

The backlog is **stale in both directions**; these are done:

- **"Real S3 driver — StorageModule stub returns `stub-storage.local`"** → **shipped.**
  `storage/storage.module.ts:116` has a full `S3StorageProvider` (presigned POST with
  content-type + content-length-range pinning, presigned GET, `deletePrefix`), selected
  by `STORAGE_DRIVER === "s3"` (line 208), with boot-time validation of the four S3
  env vars (`config/env.ts:112`). The stub is dev/CI only.
- **"Announcement push fan-out — `notify` is per-user, a new announcement does not push"**
  → **effectively closed.** `announcements.service.ts:76-80` loops the resolved
  recipients and calls `notify()` per resident inside a best-effort try/catch, and
  `notify()` now also emails. Only the *OS push* transport is missing, which is the
  separate deferred item.
- **"Manager-side admin UI for exit requests"** → shipped (the full approve/reject
  workflow landed 2026-07-14).
- **"Rename buildings/floors/rooms/beds"**, **"OVERDUE transition"**, **"Reminder
  scoping"**, **"Extra charges"**, **"Invoice void"** → already marked ✅, confirmed.

Remaining un-notified events (low): adding an extra charge does not notify the
resident, and complaint status updates do not either. The only `notify()` call sites
are payment approve/reject (`rent.service.ts:951,957`), announcements, and rent
reminders (`jobs.service.ts:123`).

---

## 5. Your `todo.txt` — status

- **"/property — so many API calls on create/delete building, create floor"** →
  **confirmed open.** `apps/admin/app/(app)/property/page.tsx:143` — `load()` refetches
  **all four** endpoints (buildings + floors + rooms + beds) and is called via
  `refresh()` after *every* mutation (lines 373-457). The page uses hand-rolled
  `useState` + `useEffect`, no react-query cache (`grep -c invalidateQueries` → 0 in
  property, menu, and residents). Fix = apply the mutation's response to local state,
  or reload only the affected level.
- **"/menu — refetches after adding food; also calls a config API"** → **confirmed
  open.** `menu/page.tsx:102-104` loads `config()` + `slots()` together; line 157 and
  line 173 re-fetch after upsert/delete.
- **"/residents — so many API calls after adding a resident"** → same hand-rolled
  reload pattern, no cache.
- **"No-preference rooms should show for student AND professional"** → **confirmed
  open, and it's a one-line bug.** `residents/page.tsx:1894`:
  `beds.filter((b) => b.occupationPreference === occFilter)` — rooms with a **null**
  preference (= no preference) are excluded from both filters. Should be
  `b.occupationPreference === occFilter || b.occupationPreference == null`.
- **"Rename Sunrise → Basera everywhere"** → **done in product code** (`c2feb67`).
  Leftovers are docs/dev-only: `CLAUDE.md:127`, `apps/admin/CLAUDE.md:194`,
  `apps/mobile/CLAUDE.md:250`, a comment in `apps/mobile/global.css:9`, a lookup in
  `apps/api/scripts/add-residents.mjs:95`, and e2e fixtures. Not customer-facing.

**Doc drift:** `CLAUDE.md:127` tells you to run `node apps/api/scripts/seed-demo.mjs`
— that file no longer exists. The scripts are `seed.mjs`, `seed-platform-admin.mjs`,
`add-residents.mjs`, `truncate.mjs`.

---

## Suggested order

1. SES live + out of sandbox (1b) — ops, and upstream of everything resident-facing:
   no bed allocation, no notifications, and codes leaking to logs until it's done.
2. SMS driver (1a) — code; unblocks resident login once residents can have beds.
3. `trust proxy` + `helmet` (2b, 2e) — two lines.
4. Fix the red test (2a) — do not launch on a red suite.
5. `occupationPreference == null` filter (5) — one line, user-reported.
6. Mobile move-out month semantics (2c) — real money.
7. Bed decommission (2d), then the admin refetch cleanup (5).
