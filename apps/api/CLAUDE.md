# CLAUDE.md — apps/api (NestJS backend)

API-layer detail. For business context, decisions, and progress see the root
`CLAUDE.md`. This is the only server in the system.

## Stack
NestJS 10 (CommonJS) · Drizzle ORM + `pg` · Postgres 16 · Redis (`ioredis`) ·
`@nestjs/jwt` · `argon2` · Zod (via `@pg/shared`). Tests: Jest + ts-jest.

## Directory map
```
src/
  main.ts                     bootstrap, CORS, shutdown hooks
  app.module.ts               root module + /health
  config/env.ts               Zod-validated env (ENV token, loadEnv)
  db/
    schema/                   Drizzle tables: tenants, auth-identities, users
                              index.ts exports `schema` + `RLS_TABLES`
    database.module.ts        @Global pools + drizzle handles + tokens:
                              APP_POOL/PLATFORM_POOL, APP_DB/PLATFORM_DB, ENV
    tenant-context.ts         TenantContextService (ALS + SET LOCAL txn)
    migrate.ts                migration runner: tables -> RLS -> grants
    migrations/               generated SQL (drizzle-kit)
  rls/
    tenant-context.interceptor.ts   wraps tenant requests in the RLS txn
    rls-isolation.spec.ts           THE isolation gate test
  security/security.module.ts @Global: JwtModule + APP_GUARDs + APP_INTERCEPTOR
  common/
    decorators.ts             @Public, @Roles, @CurrentUser
    jwt-auth.guard.ts         verifies access token -> req.auth (tenant source)
    roles.guard.ts            enforces @Roles
    zod-validation.pipe.ts    ZodBody(schema)
  auth/                       manager login + resident OTP (AuthService/Repo, OtpService)
  platform/                   super-admin onboarding + metering (PLATFORM_DB, BYPASSRLS):
                              PlatformService (onboard) + MeteringService (billing_snapshots,
                              live overview, monthly snapshot)
  branding/                   white-labeling: public by-slug read (APP_DB) +
                              manager self-service branding/logo (BrandingService)
  residents/                  resident register/list/get (+ current bedLabel)
  property/                   CRUD buildings/floors/rooms/beds + edit room rent
  allocation/                 allocate/move-out/list + bed suggestions (AllocationService)
  storage/                    StorageProvider seam (presigned URLs) + local stub
  rent/                       rent loop: invoices + payments (RentService, 2 controllers)
  notifications/              feed + push_tokens + NotificationChannel (Expo stub)
  jobs/                       BullMQ JobsModule + JobsService (cross-tenant batch)
  documents/                  KYC docs: resident upload + manager verify/reject
  deposits/                   deposits + exit settlement ledger (DepositsService)
  redis/redis.module.ts       @Global Redis client (REDIS token)
```

## Request lifecycle (security)
Guards run before interceptors, so per request:
1. `JwtAuthGuard` — verifies access JWT, sets `req.auth` = `{ sub, tenantId, role }`.
   Skips `@Public()` routes.
2. `RolesGuard` — enforces `@Roles(...)`.
3. `TenantContextInterceptor` — if `req.auth` is a tenant user (role ≠
   PLATFORM_ADMIN, tenantId present), wraps the handler in
   `TenantContextService.run(tenantId, ...)` → opens a txn, `SET LOCAL
   app.current_tenant_id`, runs inside ALS. Skipped for public + PLATFORM_ADMIN.

## Adding a new tenant-scoped feature (the standard recipe)
1. Add the Zod DTO(s) to `packages/shared/src/schemas/` and export from its
   `index.ts`; `pnpm --filter @pg/shared build`.
2. Add the Drizzle table in `src/db/schema/<name>.ts` with a non-null
   `tenantId` FK to `tenants`; export it from `schema/index.ts` **and add the
   table name to `RLS_TABLES`** (this auto-applies RLS in `migrate.ts`).
   - **If it references another tenant table** (a child), use a **composite FK
     carrying `tenant_id`**, NOT a bare `parent_id` FK: give the parent
     `unique(id, tenantId)` and have the child's `foreignKey({ columns:
     [parentId, tenantId], foreignColumns: [parent.id, parent.tenantId] })`.
     FK checks bypass RLS, so this is what keeps the reference in-tenant (see
     root CLAUDE.md §3.4). `buildings/floors/rooms/beds/allocations` are the
     worked examples.
   - **Money columns are integer paise** (e.g. `monthly_rent_paise`). No floats,
     no `numeric` — every currency value in the system is paise.
   - For "at most one active X" invariants, use a **partial unique index**
     (`uniqueIndex(...).where(sql\`end_date is null\`)`) — see `allocations`.
   - For a **status transition with irreversible side effects** (approve, exit),
     guard with a **conditional UPDATE first** (`SET status=next WHERE id=? AND
     status=current`, then assert 1 row affected → else 409) BEFORE the side
     effects, inside the txn. select-then-update is not concurrency-safe. Put the
     guard on the always-present entity (e.g. resident status for exit, not the
     optional deposit). See `DepositsService.settleExit`.
3. `pnpm db:generate` then `pnpm db:migrate`. **Inspect the generated SQL first**
   — drizzle-kit may emit an `ALTER TABLE … ADD CONSTRAINT unique` for a
   pre-existing parent table AFTER a new child's FK that references it, which
   fails (42830). If so, reorder so the unique constraint is created before the
   referencing FK (done once in `migrations/0001`).
4. Service: inject `TenantContextService`; use `ctx.db()` for queries and
   `ctx.currentTenantId()` for the tenant id. **Set `tenantId` from context on
   inserts — never from the request body.** RLS `WITH CHECK` is the backstop.
5. Controller: `@Roles(UserRole.PG_MANAGER)` (or RESIDENT — `@Roles` works at
   method level too, for mixed manager/resident controllers), validate bodies
   with `new ZodBody(schema)`.
   - **Resident-facing endpoints:** RLS does NOT isolate residents within a
     tenant. Read the actor via `@CurrentUser()` and pass `user.sub` to the
     service; filter/own every query by it (`where resident_id = sub`). Never
     accept a `residentId`/`userId` from the body. Manager-set fields (e.g. a
     reviewer id) also come from `sub`. See `RentService`/`NotificationsService`.
6. Register the module in `app.module.ts`.
7. Add/extend tests; the isolation guarantee is covered centrally by
   `rls-isolation.spec.ts` (add new RLS tables there if you want explicit
   per-table coverage).

## Cross-tenant / platform code
Only the platform module may inject `PLATFORM_DB` (BYPASSRLS). Use it for
onboarding and metering only. Platform routes are `@Roles(UserRole.PLATFORM_ADMIN)`
and are NOT wrapped in a tenant txn.

## Scheduled jobs (`jobs/`, BullMQ)
`JobsModule` runs a BullMQ worker in-process (repeatable monthly generation +
daily reminders) that calls `JobsService`. A batch job is cross-tenant but must
NOT run business logic on the platform pool: `JobsService.forEachTenant` lists
ids via `PlatformService.listActiveTenantIds()` (the only cross-tenant read),
then does each tenant's work inside `TenantContextService.run(tenantId, …)` on
the app pool, so RLS still applies and a bug can't cross-bill. Each tenant's
`run()` is wrapped in its own try/catch so one failure doesn't abort the batch.
`TenantContextService` is not request-scoped, so it works fine outside HTTP.
Platform-admin `POST /platform/jobs/*` calls the same service synchronously for
ops/tests; the worker provides the schedule.

## Storage & notifications (seams)
- `StorageModule` — `StorageProvider` (presigned upload/download). Local stub
  returns tenant-namespaced keys (`{tenantId}/payments/…`); swap S3 driver later.
- `NotificationsModule` — `NotificationsService.notify()` writes a feed row AND
  fans a push out via `NotificationChannel` (Expo stub logs). Same seam idea as
  `SmsProvider`.

## Auth specifics
- Manager: `POST /auth/manager/login` (email+password, argon2). Email is globally
  unique in `auth_identities`.
- Resident: `POST /auth/resident/otp/request` then `/verify` — both take
  `pgCode` (tenant slug) + `phone`, because phone is unique only per-tenant. OTP
  in Redis (`otp:{tenantId}:{phone}`), dev code logged when `OTP_DEV_LOG=true`.
- Tokens: access signed with `JWT_ACCESS_SECRET` (default TTL), refresh signed
  explicitly with `JWT_REFRESH_SECRET`. `POST /auth/refresh` re-mints.
- Real SMS later: implement `SmsProvider` (see `auth/otp.service.ts`).

## Env (see .env.example)
Three DB URLs encode the role split: `DATABASE_URL` (app_user),
`PLATFORM_DATABASE_URL` (platform_user), `MIGRATION_DATABASE_URL` (postgres).
`DB_POOL_MAX` is set to 1 by the isolation test to force connection reuse.

## Commands
```bash
pnpm --filter @pg/api dev              # nest watch
pnpm --filter @pg/api build            # nest build -> dist/
pnpm --filter @pg/api typecheck        # tsc --noEmit
pnpm --filter @pg/api test             # all jest, SERIALIZED (--runInBand)
pnpm --filter @pg/api test:isolation   # the RLS gate (needs infra up + migrated)
pnpm --filter @pg/api test:e2e         # the HTTP e2e suite under src/e2e/
pnpm db:generate / pnpm db:migrate     # from repo root
```

## Tests (`src/e2e/` + the RLS gate)
Two committed layers, both need **infra up + migrated** (`pnpm infra:up &&
pnpm db:migrate`):
- `src/rls/rls-isolation.spec.ts` — the DB-level isolation gate (raw pools as
  `app_user`, max=1). Add new RLS tables here for explicit per-table coverage.
- `src/e2e/*.e2e-spec.ts` — black-box HTTP e2e over the real `AppModule`, one
  file per milestone (property-allocation/rent/documents-deposits/operations).
  `harness.ts` (`createHarness()`) boots the app with `@nestjs/testing` +
  supertest, **reusing the app's own `JwtService`** (to mint the PLATFORM_ADMIN
  token — super-admin has no login endpoint) and **`REDIS`** (to read the dev
  OTP for resident login). It onboards unique-slug tenants and **deletes them in
  `close()`** (call it in `afterAll`, which also `app.close()`s → BullMQ
  worker/queue + pools shut down cleanly).
- **The whole suite shares ONE Postgres + Redis, so it MUST run serialized** —
  `test`/`test:e2e`/`test:isolation` all pass `--runInBand`. Don't drop it or
  parallel app boots clash on the `rent-jobs` queue.
- New-feature recipe: add a `<feature>.e2e-spec.ts` using the harness; assert
  cross-tenant invisibility + (for resident surfaces) intra-tenant ownership.
  Don't exercise the cross-tenant batch jobs here (rent generation, billing
  snapshot) — they read ALL tenants.
- **Platform/metering specs see EVERY tenant** (the BYPASSRLS pool isn't
  RLS-scoped + the harness only cleans up on graceful `afterAll`). So a
  `/platform/*` spec MUST scope assertions to the run's onboarded tenant ids and
  assert exact per-tenant numbers — never a global count/sum. See
  `metering-branding.e2e-spec.ts`.

## Gotchas learned
- Postgres reserves role names starting with `pg_` → roles are `app_user` /
  `platform_user`.
- Host Postgres port is **5433** (5432 taken by another project here).
- pnpm blocks native build scripts; `argon2`/`esbuild` are allowlisted in root
  `package.json` `pnpm.onlyBuiltDependencies` (run `pnpm rebuild` if argon2 fails).
- `@pg/shared` must be built (`dist/`) before `nest build`/typecheck resolve it;
  Jest maps it to source via `moduleNameMapper`.
- BullMQ bundles its own `ioredis`; pass **connection options** (host/port parsed
  from `REDIS_URL`) to `Queue`/`Worker`, NOT a shared `IORedis` instance — two
  ioredis versions coexist and instance types clash across them (`jobs.module.ts`).
- Enum consts (`PaymentStatus.APPROVED`) are values, not a namespace — don't use
  them in type position; use `typeof PaymentStatus.APPROVED` for a literal type.
