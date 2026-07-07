# Mandatory Terms & Conditions Acceptance

## Context

The platform (a multi-tenant SaaS for PG hostels) needs a **legally protective T&C
gate**: before any PG owner or manager can use the admin dashboard, they must accept
the latest published Terms & Conditions. The terms disclaim the platform's
responsibility for rent, deposits, disputes, fraud, data accuracy, uptime, and
misuse — so acceptance must be **enforced, versioned, and re-prompted** whenever a
new version is published.

Two decisions were confirmed with the user:
- **Publisher = platform super-admin** (the SaaS operator). This requires adding a
  real platform-admin login to the admin app (today `PLATFORM_ADMIN` has no
  credential row and no login path). Owners/managers only ever *accept*.
- **T&C content is DB-editable markdown** authored in the management UI, so new
  terms can be published without a code deploy.

**Scope note (enforcement boundary):** the acceptance gate is **client-side**, exactly
like the existing `mustChangePassword` and PG-selection gates (admin CLAUDE.md: "the
route guard is UX, not enforcement; the API is the trust boundary"). This is a
deliberate, consistent choice — not a gap. The accept/status endpoints are still
role-gated server-side; true per-route API blocking (a global interceptor on every
handler) is out of scope.

---

## Backend (`apps/api`)

### 1. Shared schemas — `packages/shared/src/schemas/terms.ts` (+ export from `index.ts`)
- `tcVersionSchema` → `{ id, version: number, body: string, publishedAt: string }`
- `tcStatusSchema` → `{ latestVersion: number | null, accepted: boolean, body: string | null, publishedAt: string | null }`
- `tcAcceptInput` → `{ version: number }`
- `publishTcInput` → `{ body: string }` (min length guard)
- Rebuild: `pnpm --filter @pg/shared build` before API typecheck.

### 2. Two **non-tenant** tables (NOT added to `RLS_TABLES`) — same class as `auth_identities`
Model file style on `db/schema/invoice-schedules.ts`.
- `db/schema/tc-versions.ts` → `tc_versions`: `id uuid pk`, `version integer notNull unique`
  (monotonic), `body text notNull`, `publishedByEmail text` (audit label from the
  platform-admin JWT — no FK, platform admin has no `users` row), `publishedAt timestamptz default now()`.
- `db/schema/tc-acceptances.ts` → `tc_acceptances`: `id uuid pk`,
  `authIdentityId uuid notNull → auth_identities.id (onDelete cascade)`,
  `version integer notNull`, `acceptedAt timestamptz default now()`, with
  `unique(authIdentityId, version)` (idempotent accept).
- Export both from `db/schema/index.ts` `schema` object. **Do NOT list them in
  `RLS_TABLES`** — `migrate.ts` grants DML on all tables to `app_user`, so they work
  on `APP_DB` with no RLS (the deliberate pattern for global tables). Acceptance is
  keyed by `auth_identities.id` — the single stable per-human credential (a `users.id`
  is wrong: owners have none on the global token and a different one per PG).
- `pnpm db:generate` → **inspect generated SQL** → `pnpm db:migrate`.

### 3. `TermsModule` — `apps/api/src/terms/` (register in `app.module.ts`)
`TermsService` injects **`APP_DB`** directly (like `AuthRepository`), NOT `ctx.db()` /
`PLATFORM_DB` — the accept/status calls must work both inside tenant context (manager,
PG-scoped) and without it (owner **global** token). To resolve the caller's
`auth_identities.id` from the JWT, **reuse `AuthRepository.findIdentityForPrincipal(sub,
tenantId, role)`** — export `AuthRepository` from `AuthModule` and import `AuthModule`
into `TermsModule`.

`TermsController` (mixed method-level roles, like `InvoicesController`):
- `GET /terms/status` — `@Roles(PG_OWNER, PG_MANAGER)`. Resolve latest version; resolve
  the principal's credential. **Fail OPEN, never 401:** if no version is published, or
  the credential can't be resolved (owner on a *PG-scoped* token — `findIdentityForPrincipal`
  returns nothing there), return `{ accepted: true, latestVersion: null, body: null }`.
  A 401 here would trip api-client's `onUnauthorized` → `/login` redirect loop after
  `switchPg`. Returns `body`/`publishedAt` too so the `/terms` page needs one call.
- `POST /terms/accept` — `@Roles(PG_OWNER, PG_MANAGER)`. Resolve `auth_identities.id`;
  upsert `(authIdentityId, version)` (idempotent via the unique index). Reject if the
  posted `version` ≠ current latest (409) so a stale client can't accept a superseded doc.
- `GET /terms/versions` — `@Roles(PLATFORM_ADMIN)`. List all versions, newest first.
- `POST /terms/versions` — `@Roles(PLATFORM_ADMIN)`. `body` from `ZodBody`; new row with
  `version = max(version)+1`, `publishedByEmail` from the JWT. Publishing a new version
  supersedes everyone's prior acceptance → all owners/managers re-prompted (versioning).

`RolesGuard` confirmed: a direct `PLATFORM_ADMIN` token satisfies `@Roles(PLATFORM_ADMIN)`
by exact match; `PG_OWNER` only outranks `PG_MANAGER`, so owners cannot publish.

### 4. Platform-admin login (new auth path)
`managerLogin` already works for any password identity except `RESIDENT` — so a
`PLATFORM_ADMIN` row in `auth_identities` (`tenantId null`, `userId null`, `passwordHash`
set) logs in and mints a token `{ sub: identity.id, tenantId: null, role: PLATFORM_ADMIN }`.
`TenantContextInterceptor` already skips `PLATFORM_ADMIN` (no tenant txn). **No AuthService
change needed.**
- Seed script `apps/api/scripts/seed-platform-admin.mjs`: create/upsert the credential from
  **env** `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` (argon2 hash). Per the standing
  instruction, do NOT hardcode or invent a password — read from env; ask Viral for the values
  at run time. The same script (or `seed-terms.mjs`) seeds **T&C version 1** with the
  professional body below so there is something to accept out of the box.

---

## Admin frontend (`apps/admin`) — static export; run `pnpm --filter @pg/admin build` to catch export violations

### 5. api-client — add a `terms` group to `packages/api-client/src/client.ts`
`terms.status()` → `GET /terms/status`; `terms.accept(version)` → `POST /terms/accept`;
`terms.listVersions()` → `GET /terms/versions`; `terms.publish(body)` → `POST /terms/versions`.
Typed from `@pg/shared`. Mirror the `invoices.getSchedule/setSchedule` shape.

### 6. Auth state + routing helpers (`lib/auth.tsx`, `lib/api.ts`)
- **`lib/auth.tsx`:** add `termsPending: boolean` + `tcLoading: boolean` to the context,
  fetched by a **separate** `loadTermsStatus()` (do NOT fold into `loadBranding` — `switchPg`
  re-calls `loadBranding` on the PG-scoped owner token, which would re-gate). Call
  `loadTermsStatus()` on mount-hydrate and after `login()`, **only for `PG_OWNER`/`PG_MANAGER`**
  (skip `PLATFORM_ADMIN`). Do **not** re-fetch it in `switchPg`. Expose a `refreshTerms()` for
  the `/terms` page to clear the flag after accepting.
  - Known limitation to state in code comment: an owner already inside a PG-scoped session
    won't be re-prompted for a newly published version until they return to the chooser /
    re-login (their credential is only addressable on the global token). Acceptable.
- **`lib/api.ts`:** add `needsTcAcceptance(user, termsPending)` (true only for
  `PG_OWNER`/`PG_MANAGER` when `termsPending`). Extend `landingPath` precedence to:
  `!user → /login` → `needsPasswordChange → /change-password` → **`PLATFORM_ADMIN → /terms-admin`**
  → `needsTcAcceptance → /terms` → `needsPgSelection → /pgs` → `/dashboard`. Since `landingPath`
  is pure, thread `termsPending` in from `useAuth()` at each call site (`login/page.tsx`, `page.tsx`).

### 7. The gate — extend guards for the async decision
- **`app/(app)/layout.tsx`:** add to the effect and the spinner condition:
  gate on `tcLoading` (so a manager doesn't flash `/dashboard` before status resolves),
  redirect to `/terms` when `needsTcAcceptance(...)`, and **bounce a null-tenant
  `PLATFORM_ADMIN` out** to `/terms-admin` (today `needsPgSelection` only catches `PG_OWNER`,
  so nothing stops a platform admin from entering the tenant shell whose nav assumes a tenant).
- **`app/pgs/page.tsx`:** owners are gated at the global-token stage *before* PG selection —
  add the same `needsTcAcceptance` redirect here (owners never enter `(app)`; their only stop
  is the chooser).

### 8. New full-screen page `app/terms/page.tsx` (out of `(app)` shell) — model on `app/change-password/page.tsx`
- Self-guard effect: `!user → /login`; already-accepted / not an acceptor → `landingPath`.
- Layout: `flex min-h-dvh items-center justify-center bg-muted px-4 py-10`, brand mark box
  (`bg-brand text-brand-foreground rounded-xl`), a `<Card>` with a **scrollable** T&C body
  region (`max-h-[60vh] overflow-y-auto`) rendering `status.body` with `whitespace-pre-line`
  (plain-text render — **no `dangerouslySetInnerHTML`**, no new markdown dep, no XSS surface),
  a required "I have read and agree" checkbox, and an **Accept & continue** `<Button loading>`.
- On accept: `api.terms.accept(status.latestVersion)` → `refreshTerms()` →
  `router.replace(landingPath(...))` (manager → `/dashboard`; owner → `/pgs`).

### 9. New management page `app/terms-admin/page.tsx` (out of `(app)` shell, `PLATFORM_ADMIN` only)
Platform admin has no tenant, so it lives outside the manager shell (like `/pgs` for owners).
- Self-guard: non-`PLATFORM_ADMIN` → `landingPath`.
- Uses design-system primitives (`PageHeader`, `Card`, `Button`, `Dialog`, `Textarea`/native
  textarea with `inputClass`): shows the current published version + `publishedAt`, a list of
  past versions (`terms.listVersions()`), and a **Publish new version** `<Dialog>` with a
  textarea for the markdown body → `terms.publish(body)` → refetch. Follows the single-record
  management pattern of the Rent Schedule tab (load on mount, mutate in a Dialog, refetch on success).

---

## Professional T&C content (seeded as version 1, editable thereafter)

Plain-text/markdown covering, at minimum: platform is **only a management tool** for PG/hostel
operations; users are **solely responsible** for rent collection, deposits, utility payments,
resident verification, agreements, and legal compliance; the platform is **not liable** for
missed rent, financial losses, disputes, payment failures, fraud, or any owner/manager↔resident
transactions; users are responsible for the **accuracy of data** they enter; **service
availability is not guaranteed** (maintenance/outages may occur); users must **secure their
accounts**; the platform must **not be used for illegal/unauthorized activity**; and the terms
**may change**, with acceptance of the latest version required to continue. Written in numbered
sections for readable `whitespace-pre-line` rendering.

---

## Verification (end-to-end)

Prereq: `pnpm infra:up && pnpm db:migrate`, `pnpm --filter @pg/shared build`, API running,
`node apps/api/scripts/seed-demo.mjs` + `seed-owner.mjs` + the new `seed-platform-admin.mjs`
+ T&C v1 seed.

**API e2e** (`apps/api/src/e2e/terms.e2e-spec.ts`, via `createHarness`) — cover all four token
states:
1. Manager (PG-scoped) `GET /terms/status` → `accepted:false`; `POST /terms/accept` → status
   flips to `accepted:true`; re-accept is idempotent.
2. Owner on the **global** token accepts successfully.
3. Owner on a **PG-scoped** token (`GET /terms/status`) returns `accepted:true` and **does not
   401** (fail-open — guards the `switchPg` redirect loop).
4. Publish a **new version** (`POST /terms/versions` as `PLATFORM_ADMIN`) → a previously-accepted
   user's status flips back to `accepted:false`.
5. `PG_OWNER`/`PG_MANAGER` receive 403 on `POST /terms/versions`; `PLATFORM_ADMIN` succeeds.
Run: `pnpm --filter @pg/api test` (whole suite stays green).

**Admin build/typecheck:** `pnpm --filter @pg/admin build` (the real static-export check) +
`typecheck`.

**Manual click-through** (`pnpm --filter @pg/admin dev`):
- Manager login (`manager@sunrise.pg`) → forced to `/terms` → accept → `/dashboard`; log out/in →
  not re-prompted.
- Owner login (`owner@pgowner.demo`) → `/terms` (on global token) → accept → `/pgs`.
- Platform-admin login → lands on `/terms-admin`, never the tenant shell; publish a new version;
  confirm the manager and owner are re-prompted on next login.
- Direct-nav a signed-in, unaccepted user to `/dashboard` → bounced to `/terms`.

## Critical files
- API: `packages/shared/src/schemas/terms.ts`, `apps/api/src/db/schema/tc-versions.ts` +
  `tc-acceptances.ts` + `index.ts`, `apps/api/src/terms/*` (module/controller/service),
  `apps/api/src/app.module.ts`, `apps/api/src/auth/auth.module.ts` (export `AuthRepository`),
  `apps/api/scripts/seed-platform-admin.mjs`.
- Admin: `packages/api-client/src/client.ts`, `apps/admin/lib/auth.tsx`, `apps/admin/lib/api.ts`,
  `apps/admin/app/(app)/layout.tsx`, `apps/admin/app/pgs/page.tsx`, `apps/admin/app/terms/page.tsx`,
  `apps/admin/app/terms-admin/page.tsx`.
