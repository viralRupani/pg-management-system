# Backend Audit — 2026-06-21

## Summary

Since the 2026-06-17 audit the codebase grew several new tenant-scoped features:
the **extra-charges module**, **complaints pagination + backend filtering +
resident search**, **per-tenant UPI QR** branding, **property rename** (building→
bed), the **dashboard stats/alerts** upgrade, and — the most security-relevant —
**"apply deposit to invoice"** (settle a rent invoice from the resident's held
deposit). The 06-17 Medium (the non-idempotent `auth-password` e2e leak) is
**fixed**: the full suite now runs **203/203 green** with no carry-over failure.

The headline new finding is a **concurrency bug on a money write**: the new
`DepositsService.applyToInvoice` checks the deposit's available balance with a
racy select-then-act and the deposit row is never locked, so two concurrent
applies against the *same resident's two different unpaid invoices* can both pass
the balance check and over-draw the deposit (the per-invoice conditional flip
does not serialize them — different rows). That is an unguarded race on a money
path → **High**. Everything else is lower: a stale `drizzle-orm` with a published
SQLi advisory (Medium, dependency bump), and four Lows (public branding leaks the
UPI QR field, unbounded charge amount, JWT-in-localStorage on the static SPAs,
and an unreachable `multer` DoS advisory).

This run also added a **live dynamic layer** (the user emphasised the apps are
running): the API on :4000 was exercised with curl — health, auth rejection,
and the public branding read — and `pnpm audit` was run across the workspace.
The three client apps (admin, landing, mobile/resident-web) were reviewed for
the checks that actually matter for static-export SPAs / an Expo client:
shipped-bundle secrets, token storage, and dependency vulnerabilities.

**Counts: Critical: 0 · High: 1 · Medium: 1 · Low: 5**

---

## Test suite

**Command:** `pnpm --filter @pg/api test` (serialized `--runInBand`; infra up +
migrated — Postgres :5433, Redis :6379 both confirmed listening).

**Result: 203 passed, 0 failed — 203 tests across 21 suites.** Including the new
`deposit-apply-rent.e2e-spec.ts`, `charges.e2e-spec.ts`,
`transfer-auto-activate.e2e-spec.ts`, `dashboard-alerts.e2e-spec.ts`, and
`invoice-delete.e2e-spec.ts`. The 06-17 failing `auth-password.e2e-spec.ts`
(PwFlag tenant leak) now passes — **regression fixed / non-idempotency resolved.**

**Coverage gap (drives the High below):** `deposit-apply-rent.e2e-spec.ts` has
**no concurrency test** — no `Promise.all`/parallel apply. The over-draw race is
therefore untested.

---

## Live checks (dynamic, against the running services)

| Check | Result |
|---|---|
| `GET /health` | `200` in ~11 ms |
| `GET /complaints` no token | `401` (guard rejects) |
| `GET /dashboard/stats` with bogus bearer | `401` |
| `GET /branding/bliss-homes` (public) | `200` — returns `{name, slug, logoUrl, accentColor, upiQrUrl}` (see Low #1) |
| `pnpm audit --audit-level high` | 10 high / 14 moderate / 6 low across the workspace |

---

## Findings

### [HIGH] Deposit over-draw race in `applyToInvoice` (unguarded balance check on a money write)

- **Where:** `apps/api/src/deposits/deposits.service.ts:211-291` (balance check
  at 245-251; deduction insert at 274-282; no row lock).
- **What:** Settling rent from a held deposit reads the deposit's prior
  deductions (`sumDeductions`, line 246), computes `available = held − prior`
  (247), checks `available ≥ invoice.amountPaise` (248), then inserts a
  `DEDUCTION`. The deposit row is selected **without `FOR UPDATE`** (231-239) and
  there is no atomic guard on the running balance. The conditional flip at step 4
  (254-267) only protects the *individual invoice* from double-apply — it guards a
  different row each time. Two concurrent `POST /deposits/apply-to-invoice` calls
  for the **same resident's two different unpaid invoices** (a resident can hold
  both an OVERDUE and a PENDING invoice) both read the same `prior`, both pass the
  balance check, both flip their distinct invoices to PAID, and both insert a
  DEDUCTION — total deductions then exceed the held amount. Under Postgres
  READ COMMITTED (the default) this is a real interleaving; even REPEATABLE READ
  would not catch it (no write-write conflict on the deduction rows).
- **Impact:** The deposit ledger is corrupted — sum(DEDUCTION) > held. At exit,
  `settleExit` computes the refund from these deductions, so the resident is
  refunded the wrong (too-low / negative) amount, or the manager has settled two
  months of rent against a deposit that only covered one. Trusted-manager-
  triggered, but it is silent data corruption on money. (Same missing lock also
  lets an `applyToInvoice` race a `settleExit` — apply never checks resident
  status, so it can stamp a DEDUCTION onto a deposit being exited.)
- **Fix:** Lock the deposit row inside the transaction before reading its balance:
  `select ... from deposits where ... for update` (Drizzle `.for("update")`) at
  step 2. That serialises concurrent applies (and apply-vs-exit) on the same
  deposit so the second sees the first's committed deduction and fails the balance
  check with a clean 409. Add a concurrency case to
  `deposit-apply-rent.e2e-spec.ts` (two parallel applies on two invoices of one
  resident whose deposit covers only one → exactly one 200, one 409).
- **Confidence:** Confirmed by reading the method and grepping the file for any
  `FOR UPDATE`/`.for(` (none present).

---

### [MEDIUM] `drizzle-orm` 0.38.3 — below the SQLi-patched 0.45.2 — ✅ FIXED (2026-06-21)

> **Resolved same day.** Bumped `drizzle-orm` 0.38.4 → **0.45.2** and `drizzle-kit`
> 0.30.6 → **0.31.10**. `pnpm db:generate` reports no schema drift; typecheck clean;
> full suite **203/203 green**. The 0.44+ breaking change (DB errors now wrapped in
> `DrizzleQueryError`, original `pg` error on `.cause`) silently regressed four
> unique-violation 409s to 500s — fixed by a shared `isUniqueViolation` helper
> (`apps/api/src/db/pg-errors.ts`) that walks the `cause` chain, replacing four
> local `err.code === "23505"` copies (deposits, residents, bookings, allocation).
> Advisory GHSA-gpj5-g38j-94v9 confirmed cleared by `pnpm audit`.


- **Where:** `apps/api/package.json` (`"drizzle-orm": "^0.38.3"`; installed
  0.38.x) vs advisory **GHSA-gpj5-g38j-94v9** (SQL injection, fixed in 0.45.2).
- **What:** The ORM that builds **every** query in the system carries a published
  high-severity SQL-injection advisory for `<0.45.2`. The codebase mostly uses
  parameterised builders and the `sql` tagged template (which parameterises), so
  the specific vulnerable escaping path may not be hit today, but a query layer
  one version-range below a known SQLi fix is not where you want to sit.
- **Impact:** Potential SQL injection depending on the query patterns exercised;
  at minimum, an unpatched core dependency on the trust boundary.
- **Fix:** Bump `drizzle-orm` to `>=0.45.2`. Note 0.38→0.45 crosses several
  Drizzle minors with known breaking changes — budget for **code changes**, not
  just a version pin. Re-run `pnpm db:generate` to confirm migrations emit
  identically, then the full suite + the RLS isolation gate after the bump.
- **Confidence:** Confirmed via `pnpm audit` (path `apps__api>drizzle-orm`,
  vulnerable `<0.45.2`) and the declared version. Needs verification that no
  query uses the specific vulnerable pattern — bump regardless.

---

### [LOW] Public `GET /branding/:slug` leaks `upiQrUrl` to unauthenticated callers

- **Where:** `apps/api/src/branding/branding.service.ts:66-84` (`toBranding`,
  shared by the public `getBySlug` at 44-51) — confirmed live: the response to an
  unauthenticated `GET /branding/bliss-homes` includes `upiQrUrl`.
- **What:** `toBranding` is reused by both the public login-screen read and the
  manager read, so the public path returns the tenant's UPI QR download URL.
  Anyone who knows a slug can fetch a PG's payment QR without authenticating.
  There is already a dedicated authenticated resident endpoint
  (`GET /tenant/payment-info`) that serves exactly this.
- **Impact:** Low — a *receiving* UPI QR; exposure lets a stranger pay the PG, not
  withdraw from it. Still an unnecessary widening (the login screen only needs
  name/logo/accent), and it presigns an S3 object for anonymous callers.
- **Fix:** Drop `upiQrUrl` from the public `getBySlug` shape (split `toBranding`
  into a public projection without the QR), keeping it on `getOwn` /
  `getPaymentInfo`.
- **Confidence:** Confirmed by reading the code and by the live curl response.

---

### [LOW] Unbounded `amountPaise` on extra charges → potential int4 overflow

- **Where:** `packages/shared/src/schemas/extra-charge.ts` (`amountPaise:
  z.number().int().positive()` — no max) → `charges.service.ts:90-103`
  (`sql\`${invoices.amountPaise} + ${input.amountPaise}\``).
- **What:** Charge amount has no upper bound, while `invoices.amount_paise` /
  `extra_charges.amount_paise` are Postgres `integer` (int4, max
  2,147,483,647 ≈ ₹21.4M). A charge above that, or a sum that overflows the
  invoice total, raises a raw DB "integer out of range" error surfaced as a 500.
- **Impact:** Low — manager-only, and a hostel charge near ₹21M is implausible;
  worst case is a 500 rather than corruption. Hygiene / robustness.
- **Fix:** Add a sane `.max(...)` to `amountPaise` in the schema (e.g. cap at a
  few lakh paise) so it fails as a clean 400.
- **Confidence:** Confirmed by reading the schema and the SQL bump.

---

### [LOW] Static SPAs store the JWT in `localStorage` (XSS-reachable)

- **Where:** `apps/admin` (`api.ts` — `localStorage` TokenStore, per
  `apps/admin/CLAUDE.md:52`) and `apps/resident-web` (web build path of the same
  client). Mobile correctly uses `expo-secure-store`
  (`apps/mobile/lib/api.ts:4,15,24,33`).
- **What:** Access + refresh tokens live in `localStorage`, readable by any
  injected script. This is partly forced by the locked "static export, no SSR,
  API is the only trust boundary" decision (no server session / httpOnly cookie
  without an origin server), so it is a defense-in-depth note, not a new bug.
- **Impact:** Low given a clean React app with no `dangerouslySetInnerHTML` /
  third-party script surface; an XSS would otherwise exfiltrate a 30-day refresh
  token.
- **Fix:** Keep dependency hygiene tight on the admin/resident-web bundles; if a
  cookie-capable host is ever introduced, move tokens to httpOnly cookies. No
  action required while the static-export constraint stands.
- **Confidence:** Confirmed by grep; mobile SecureStore use confirmed.

---

### [LOW] Missing indexes on filtered FK columns in the new tables (performance)

- **Where:** `apps/api/src/db/schema/invoice-charges.ts`,
  `extra-charges.ts`, `complaints.ts` — only PK + unique constraints declared
  (`invoice_charges_charge_id_period_unique`, `extra_charges_id_tenant_id_unique`,
  `complaints_id_tenant_id_unique`). Postgres does **not** auto-index FK columns.
- **What:** Several columns that the new code filters/sorts on have no supporting
  index:
  - `invoice_charges.invoice_id` — filtered by `listForInvoice`
    (`charges.service.ts:182-197`), a **resident-facing read on every
    invoice-detail view**. The `(charge_id, period)` unique index does not serve
    an `invoice_id` lookup.
  - `extra_charges.resident_id` — filtered by `listForResident`
    (`charges.service.ts:132-139`).
  - `complaints.resident_id` and `complaints.status` — filtered/ordered by the
    new paginated `listAll` and by resident `list` (`complaints.service.ts`).
- **Impact:** Low today (tables are small), but these become sequential scans as
  charges/complaints grow — directly the performance dimension to watch on the
  new surfaces.
- **Fix:** Add btree indexes on `invoice_charges(invoice_id)`,
  `extra_charges(resident_id)`, and `complaints(resident_id)` (a
  `complaints(status)` or composite `(status, created_at)` helps the manager list)
  via a new migration.
- **Confidence:** Confirmed by reading the three schema files (no `index(...)`
  declarations beyond the unique constraints).

---

### [LOW] `multer` DoS advisories present but not reachable

- **Where:** `apps__api>@nestjs/platform-express>multer` (multiple high DoS
  advisories in `pnpm audit`).
- **What:** `multer` is a transitive dep of `@nestjs/platform-express`, but the
  API exposes **no multipart route** — all uploads go directly to S3 via presigned
  URLs (`grep` for `FileInterceptor`/`@UploadedFile`/`multipart` finds only the
  comment in `storage.module.ts` confirming "never proxied via API"). The DoS
  vectors require a multipart endpoint, so they are not exploitable today.
- **Fix:** Clears itself on the next `@nestjs/platform-express` bump; no urgency.
- **Confidence:** Confirmed — no multipart handler in `apps/api/src`.

---

## Client apps (admin / landing / mobile / resident-web) — scoped review

These are a static-export Next.js admin, a zero-framework static landing site, an
Expo client, and a static-export resident PWA. Per the project's own model the
API is the only trust boundary, so the meaningful client checks are bundle
secrets, token storage, and dependency CVEs — all done here:

- **Shipped-bundle secrets:** clean. A grep across
  `apps/{admin,landing,mobile,resident-web}` source for
  `secret|api_key|private_key|sk_live|sk_test|aws_secret` patterns returned no
  hardcoded credentials.
- **Token storage:** mobile uses `expo-secure-store` (Keychain/Keystore) — good;
  admin/resident-web use `localStorage` (Low #3 above, architecturally
  constrained).
- **Dependency vulns:** the high-severity advisories that hit the **API runtime**
  are `drizzle-orm` (Medium above) and `multer` (Low above, unreachable). The
  remaining highs — `glob`, `picomatch`, `tmp`, `form-data` (all under
  `@nestjs/cli` / `@types/supertest`) and `undici` (under `expo`/`@expo/cli`) —
  are **build/dev/test tooling, not shipped to production**, so they are
  hygiene-only; clear them on the next dependency refresh.
- **Performance:** the landing site's Lighthouse scores (100/94/100/100) are
  recorded in project memory and were not re-run. The dashboard endpoints that
  back the admin home are RLS-scoped pure aggregates with capped lists
  (`upcomingBookings`/exit list both `LIMIT 10`) — no roster fan-out
  (`dashboard.service.ts`), so the admin home stays cheap at scale.

---

## Still-open known issues

- **Orphaned transfer adjustments at exit** — still present. `settleExit`
  (`deposits.service.ts:341+`) never folds pending `rent_adjustments`. Confirmed
  the auto-transfer path now also creates these unattended
  (`allocation.service.ts:593`, `activateDueTransfers`), so the drop fires
  without a manager in the loop. First flagged 2026-06-14; no change.
- **`refresh()` drops `mustChangePassword`** (06-17 Low) — still open;
  `auth.service.ts` `refresh()` rebuilds the payload via `issueTokens` without
  forwarding the flag. Frontend-only enforcement, so no server access is granted.
- **`ConsoleEmailStub` is the only email provider, no prod guard** (06-17 Low) —
  still open; `auth.module.ts:35` hardwires the stub with no `EMAIL_DRIVER` switch
  or `NODE_ENV=production` fail-fast.
- **Refresh tokens survive a password change** (backlog) — no `passwordChangedAt`
  / `tokenVersion`; a 30-day refresh token stays valid after a reset.

---

## Checked and OK

- **Tenant isolation on the new tables:** `extra_charges` and `invoice_charges`
  are both in `RLS_TABLES` (`db/schema/index.ts:116-117`); both use composite FKs
  carrying `tenant_id` to keep resident/invoice/charge in-tenant
  (`extra-charges.ts`, `invoice-charges.ts`). No bare `parentId` FK.
- **Charges actor/target split:** `createdByUserId` from JWT `sub`; `residentId` a
  body target backstopped by the composite FK + RLS `WITH CHECK`
  (`charges.service.ts:44-53`). Apply-now uses a conditional bump
  (`amount + delta` as SQL, guarded on status, no read-modify-write).
- **Charges ownership read:** `GET /invoices/:id/charges` passes `user.sub` as the
  resident scope so a resident sees only their own invoice's charges; manager
  sees any in-tenant (`charges.controller.ts:39-44`, `listForInvoice`).
- **Complaints pagination/filter:** `complaintListQuerySchema` caps `limit` at 100
  and floors `page`/`limit` at 1; resident reads scope by `sub`; `getById`/
  `updateStatus`/`listAll` are `@Roles(PG_MANAGER)` and tenant-scoped by RLS;
  `assertVisible` enforces resident ownership on thread reads/writes.
- **Branding on the no-RLS `tenants` table:** every manager write scopes
  `where id = currentTenantId()` explicitly; slug change pre-checks for a clean
  409 with the unique index as backstop; no tenant-list endpoint
  (`branding.service.ts`).
- **Dashboard:** `@Roles(PG_MANAGER)` class-level; all stats/alerts queries via
  `ctx.db()` (RLS); cross-table joins use explicit `tenantId` equality as
  defense-in-depth; capped lists (`LIMIT 10`); no per-resident fan-out.
- **`applyToInvoice` invoice flip & money math:** the per-invoice
  PENDING/OVERDUE→PAID flip *is* a correct conditional flip (double-apply safe);
  all amounts integer paise; the only defect is the unlocked balance (High above).
- **Password reset token safety:** unchanged and correct — 32-byte CSPRNG,
  single-use Redis `GETDEL`, TTL'd, no email enumeration.
- **Auth rejection live:** unauthenticated and bogus-bearer requests to protected
  routes return 401 (verified by curl).
