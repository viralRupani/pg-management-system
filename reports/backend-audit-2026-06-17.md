# Backend Audit — 2026-06-17

## Summary

Since the 2026-06-14 audit, five issues were fixed (OVERDUE invoice approval,
rate limiting, `submitPayment` on settled invoices, N+1 in `generateMonthly`,
`RolesGuard` fail-closed). The new features shipped since then — dashboard
stats, future-dated bookings, and the auth additions (change-password,
forgot/reset-password, forced first-login flag) — are structurally sound. Two
new issues were found: a test isolation leak that makes one e2e test fail on
every run after the first (the production path itself is correct), and a
consistency gap where `refresh()` silently drops the `mustChangePassword` flag
(enforced only at the frontend layer, so no server access is granted but the
forced-change screen can be skipped via a refresh cycle). Two Low findings from
the previous audit remain open.

**Counts: Critical: 0 · High: 0 · Medium: 1 · Low: 3**

---

## Test suite

**Command:** `pnpm --filter @pg/api test` (serialized via `--runInBand`; infra up + migrated)

**Result: 164 passed, 1 failed — 165 total across 16 files.**

The single failing test is `auth-password.e2e-spec.ts → mustChangePassword JWT
flag → after changing password the new token has no mustChangePassword flag`.
The production code it exercises is correct; the failure is a test isolation
leak (see Medium finding below). The test passes on a clean database; it fails
on the second and every subsequent run because leaked database state from the
prior run changes the test's preconditions.

---

## Findings

### [MEDIUM] e2e test non-idempotent — "PwFlag PG" tenant leaks between runs

- **Where:** `apps/api/src/e2e/auth-password.e2e-spec.ts:177-282`
- **What:** The `mustChangePassword JWT flag` describe block creates an owner
  (`owner-pwflag@example.com`) and a PG (slug `pwflag-pg-${Date.now()}`) in its
  `beforeAll`. The new tenant's id is never passed to the harness — only the
  unrelated `h.onboardPg("pwflag-mgr")` call (line 206) is tracked for cleanup.
  When `h.close()` runs, `createdTenantIds` does not contain the "PwFlag PG"
  tenant, so it and its `auth_identities` rows are never deleted. On the second
  run the manager `pwflag-clear@example.com` (line 239) already exists in
  `auth_identities` (global unique index on email); `addManager` returns 409 but
  the test silently continues. The subsequent `managerLogin` with `tempPass!2`
  returns 401 because the password was changed to `permanentPw!9` in the first
  run. `firstLogin.body.accessToken` is `undefined`; the Bearer header is empty;
  `JwtAuthGuard` returns 401 at line 260's `.expect(201)`.
- **Impact:** CI reports a failing test on every run after the first. The change-
  password production path (which is itself correct) appears broken. No production
  data or security boundary is affected.
- **Fix:** Use per-run unique emails for the two test managers, e.g.:
  ```ts
  const mgrEmail = `pwflag-clear-${Date.now()}@example.com`;
  ```
  Do the same for `pwflag-manager@example.com` in the first test. Alternatively,
  expose a `harness.trackTenant(id)` helper and call it after line 197 so the
  "PwFlag PG" tenant is deleted in `close()`.
- **Confidence:** Confirmed by reading the test file and harness description;
  root cause is the hardcoded email on line 239 combined with the missing tenant
  cleanup for the owner-created PG.

---

### [LOW] `refresh()` drops the `mustChangePassword` flag

- **Where:** `apps/api/src/auth/auth.service.ts:123-127`
- **What:** `managerLogin()` (line 60) correctly sets `mustChangePassword: true`
  in the JWT payload when the `auth_identities` row has the flag. But `refresh()`
  rebuilds the payload from the decoded refresh token without forwarding the flag:
  ```ts
  return this.issueTokens({
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    // mustChangePassword not forwarded
  });
  ```
  A manager who has a `mustChangePassword:true` access token can call
  `POST /auth/refresh` and receive a clean access token with no flag.
- **Impact:** The admin frontend's forced-change redirect (a client-side check on
  the JWT claim) can be bypassed by refreshing immediately after first login. No
  server-side guard reads the flag, so no additional server access is granted —
  only the UX guard is defeated. Practically, a technically-aware manager can
  avoid the forced-change screen until their next full login.
- **Design note:** Because no API route enforces `mustChangePassword` at the
  server, propagating the flag on refresh makes the system consistent but still
  leaves enforcement entirely at the frontend. A defense-in-depth fix would add a
  server-side `MustChangePasswordGuard` (or check in `JwtAuthGuard`) that short-
  circuits all non-auth endpoints for tokens with the flag set.
- **Fix (consistency):** Forward the flag in `refresh()`:
  ```ts
  return this.issueTokens({
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    ...(payload.mustChangePassword && { mustChangePassword: true }),
  });
  ```
- **Confidence:** Confirmed by reading `auth.service.ts:97-128` and
  `auth.service.ts:55-61`.

---

### [LOW] `ConsoleEmailStub` is the only email provider — no production guard

- **Where:** `apps/api/src/auth/email-provider.ts`, `apps/api/src/auth/auth.module.ts`
- **What:** `ConsoleEmailStub` is hardwired as the `EMAIL_PROVIDER` token. There
  is no env-driven switch and no fail-fast guard that rejects startup if
  `NODE_ENV=production` is set and no real SMTP/SES config is present. Password
  reset links are only delivered to the server console log.
- **Impact:** Deploying as-is silently swallows every `forgot-password` email.
  Users see `{ sent: true }` but receive nothing; the reset link is only visible
  to anyone with server log access.
- **Fix:** Wire the provider via an env var (`EMAIL_DRIVER=console|ses|smtp`);
  add a startup assertion that refuses to boot with the stub when `NODE_ENV ===
  'production'`.
- **Confidence:** Confirmed by reading `email-provider.ts` and `auth.module.ts`.

---

## Still-open known issues

- **Orphaned rent adjustments at exit** — `deposits.service.ts:settleExit` still
  does not consume pending `rent_adjustments` rows. A mid-month transfer's delta
  is silently dropped on exit before the next monthly run. First flagged
  2026-06-14; no change.

---

## Checked and OK

- **Dashboard gating:** `DashboardController` carries `@Roles(PG_MANAGER)` at the
  class level; all six stat queries go through `ctx.db()` (RLS-scoped); the
  bookings join uses explicit `tenantId` equality as defense-in-depth;
  `upcomingBookings` is `LIMIT 10`.
- **Bookings module RLS coverage:** `bookings` is in `RLS_TABLES`
  (`db/schema/index.ts`); all FK columns carry `tenantId`; `createdByUserId`
  comes from JWT `sub`, not the request body; cancel/activate paths go through
  `freeBed()` which respects the `RESERVED→VACANT` transition.
- **Password reset token safety:** 32-byte CSPRNG hex token, single-use via
  Redis `GETDEL` (atomic), 15-minute TTL; `forgotPassword` always returns
  `{ sent: true }` (no email enumeration).
- **Rate limits on new auth routes:** `forgot-password` 3/min, `reset-password`
  5/min, `change-password` inherits module default (10/min). All skip under
  `NODE_ENV=test`.
- **`findIdentityForPrincipal` null-tenantId handling:** uses Drizzle `isNull()`
  (not `eq(col, null)`) to match PG_OWNER global credentials — no silent
  filter-always-false bug.
- **N+1 in `generateMonthly` (fixed):** `rent.service.ts:141-168` now batches
  all pending adjustments in a single query grouped in memory — confirmed fixed
  since 2026-06-14 audit.
- **`RolesGuard` fail-closed (fixed):** `common/roles.guard.ts` now throws
  `ForbiddenException("Route has no access policy")` when a non-public route
  carries no `@Roles` decorator — confirmed fixed since 2026-06-14 audit.
- **`submitPayment` on settled invoices (fixed):** confirmed from the prior audit
  — the guard on settled statuses is in place.
- **OVERDUE invoice approval (fixed):** confirmed from the prior audit.
