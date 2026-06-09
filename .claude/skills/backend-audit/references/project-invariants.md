# Project invariants — PG Management System

The load-bearing rules this backend depends on, distilled for fast auditing. The
**canonical** sources are `CLAUDE.md` (§3 Architecture) and `apps/api/CLAUDE.md`
("Adding a new tenant-scoped feature", "Request lifecycle"). If this file and
those have drifted, trust the code and the canonical docs. Use this as a
checklist of what to verify and the red flags that mean a rule has been broken.

## 1. Tenant isolation — five layers, weaken none

The whole multi-tenant safety model. A break here is almost always Critical.

| Layer | What to verify | Red flag in code |
|---|---|---|
| RLS on every tenant table | Every tenant-owned table is in `RLS_TABLES` (`src/db/schema/index.ts`) | A new table in `schema/` that's missing from `RLS_TABLES` → it has NO row-level security |
| `SET LOCAL` per request, tenant id **from JWT only** | Services use `TenantContextService.db()` / `currentTenantId()`; tenant id originates from `req.auth.tenantId` (the verified token) | Tenant id (or `tenantId`) read from the request **body/params/query** and used in a query or insert |
| DB role split | Tenant requests use `APP_DB` (`app_user`, NOBYPASSRLS); only the platform module uses `PLATFORM_DB` (BYPASSRLS) | `PLATFORM_DB` injected anywhere outside `platform/` (and the one cross-tenant read in `jobs/`) |
| Composite FKs carry `tenant_id` | Child tables reference `(parentId, tenantId)` against a parent's `unique(id, tenantId)` | A child table with a **bare** `parentId` FK and no `tenantId` in the foreign key — a cross-tenant reference becomes representable |
| App-layer ownership within a tenant | Resident-facing reads/writes scope by `user.sub`; queries filter `where resident_id = sub` | An endpoint taking `residentId`/`userId` from the body, or returning a row by `:id` without an ownership filter |

## 2. Money is integer paise — always

Every currency value is an integer number of paise. Columns are named `*_paise`.
- **Red flag:** a money column typed `numeric`, `real`, `float`, `decimal`, or a
  money value handled as a JS float / run through `parseFloat`, `/100`, etc.
  Any float on money is a bug.

## 3. Status transitions with side effects — conditional flip, not select-then-update

For approve / reject / settle-exit / allocate and similar irreversible flips:
- Correct: a single guarded `UPDATE ... SET status=next WHERE id=? AND
  status=current`, then assert exactly 1 row affected (else 409), inside the
  transaction, **before** the side effects. Guard the always-present entity
  (e.g. resident status, not an optional deposit row).
- **Red flag:** `SELECT` the row, check its status in JS, then `UPDATE` — two
  statements, racy. Two concurrent approvals can both pass the check.
- See `DepositsService.settleExit` for the worked pattern.

## 4. Actor fields come from the token, never the body

Manager-set fields like `reviewedByUserId`, and any "who did this" id, are taken
from `@CurrentUser()` / JWT `sub`.
- **Red flag:** `reviewedByUserId`, `createdByUserId`, `residentId`, etc. read
  from the request body and trusted.

## 5. Storage keys, not URLs

Always store the S3 *key*; presign on every read response.
- **Red flag:** a raw URL persisted to a `*_key`/document column, or a stored
  value returned to the client without being presigned.

## 6. Auth specifics worth checking

- Manager: email+password (argon2), email globally unique in `auth_identities`.
- PG owner: global token (`tenantId null`) → `POST /owner/pgs/:id/switch` mints a
  PG-scoped token **after verifying `owner_tenants` membership**. Check that the
  membership check can't be skipped.
- `RolesGuard` hierarchy: `PG_OWNER` satisfies `@Roles(PG_MANAGER)` one-way only.
  Verify a `PG_MANAGER` can't reach `PG_OWNER`-only routes.
- Resident OTP keyed `otp:{tenantId}:{phone}` in Redis (phone unique per-tenant).
- Manager deactivation deletes the `auth_identities` credential and sets
  `users.deactivated_at`; `refresh()` re-checks the credential so access dies at
  the access-TTL boundary. Verify revocation actually bites.

## 7. Background jobs stay tenant-safe

`JobsService.forEachTenant` lists ids via the platform read, then does each
tenant's work inside `TenantContextService.run(tenantId, …)` on the **app** pool
so RLS still applies. Each tenant wrapped in its own try/catch.
- **Red flag:** business logic in a batch job running on `PLATFORM_DB`, or a
  single failure aborting the whole batch, or work that could cross-bill.

## 8. Known-open backlog items (don't re-discover at length)

Re-confirm these are still present, one line each — they're already documented in
`docs/backlog.md`:
- **Reminder scoping:** `JobsService.sendRentReminders(undefined)` re-notifies
  every PENDING invoice daily regardless of period.
- **Decommission bed:** no endpoint to mark a bed out-of-service.
- **OVERDUE transition:** invoices stay PENDING past `due_date`.
- **Manager reactivation:** no reactivate path for a deactivated manager.

## Test commands (for Phase 3)

Need infra up + migrated first: `pnpm infra:up && pnpm db:migrate` (Postgres
:5433 + Redis). All suites run serialized (`--runInBand`).
- `pnpm --filter @pg/api test` — full Jest suite.
- `pnpm --filter @pg/api test:isolation` — the RLS isolation gate.
- `pnpm --filter @pg/api test:e2e` — black-box HTTP e2e.
- `pnpm --filter @pg/api typecheck` — `tsc --noEmit` (cheap, run even if infra is down).
