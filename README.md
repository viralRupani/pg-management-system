# PG Management System

Multi-tenant SaaS for paying-guest (PG) hostels. A **manager web dashboard**
(Next.js) and a **resident mobile app** (Expo) backed by a single **NestJS** API
on **Postgres**, with strict per-PG data isolation via **Row-Level Security**.

## Monorepo layout

```
apps/
  api/      NestJS backend — the only server (auth, RLS, business logic)
  admin/    Next.js manager dashboard — static export (client-only SPA)
  mobile/   Expo resident app (Android + iOS)
packages/
  shared/   Zod schemas + shared TS types/enums (single source of truth)
infra/      docker-compose for local Postgres + Redis
```

## Prerequisites

- Node >= 22, pnpm 10
- Docker (for local Postgres + Redis)

## Getting started (local dev)

```bash
pnpm install
pnpm infra:up                       # start Postgres (:5433) + Redis (:6379)
pnpm --filter @pg/shared build      # build shared types (required before migrate/dev)
pnpm db:migrate                     # apply migrations + RLS policies + grants
pnpm --filter @pg/api dev           # API on :4000
```

The admin dashboard (`pnpm --filter @pg/admin dev`) and resident Expo app
(`cd apps/mobile && npx expo start`) each have their own `CLAUDE.md`. See the root
`CLAUDE.md` for the full run guide and `docs/backlog.md` for open items.

## Multi-tenancy (read this before touching the DB)

Every tenant-owned table carries a non-null `tenant_id` and a Postgres RLS
policy. The API connects as a role **without** `BYPASSRLS`. Each tenant request
runs inside a transaction that first issues
`SET LOCAL app.current_tenant_id = '<tenant from JWT>'`, so the tenant context is
pinned to the same pooled connection as the query. Tenant id comes **only** from
the authenticated JWT — never from request input. The platform/super-admin path
uses a separate `BYPASSRLS` role for cross-tenant reads.

See `apps/api/src/rls/` for the implementation and `CLAUDE.md` (root) for the full
five-layer isolation model.
