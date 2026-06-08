# CLAUDE.md — apps/admin (Next.js manager dashboard)

The PG **manager** web app. For business context + the API surface see the root
`CLAUDE.md` and `apps/api/CLAUDE.md`. This is a **pure client SPA** — there is no
server here; the NestJS API is the only trust boundary.

## Stack
Next.js 16 (App Router, **Turbopack**) · **`output: 'export'`** (static export) ·
React 19 · Tailwind CSS **v4** (`@tailwindcss/postcss`, no `tailwind.config` —
tokens live in `app/globals.css` via `@theme`) · `lucide-react` icons ·
hand-rolled shadcn-style primitives (no shadcn CLI). Types/validation from
`@pg/shared`; all HTTP via `@pg/api-client`.

## The static-export constraints (READ before adding pages)
`output: 'export'` builds to `out/` as plain HTML/JS. Consequences that bite:
- **No SSR / middleware / server-actions / route handlers.** Everything is
  `"use client"`. Auth + data fetching happen in the browser only.
- **No file-based dynamic routes** (`/residents/[id]`) for runtime data — they'd
  need `generateStaticParams`, which we can't supply per-tenant. **Detail views
  use a `?id=` query param + client fetch**, not `[id]` segments. (A static
  `[id]` with a fixed param set is fine; runtime ids are not.)
- `next dev` does NOT surface export violations — **only `next build` does.** Run
  `pnpm --filter @pg/admin build` after adding pages/routes.
- `next/image` is set to `unoptimized` (no optimizer server); plain `<img>` is
  fine for the presigned logo URL.
- `trailingSlash: true` → routes serve as `/dashboard/index.html`.

## Directory map
```
app/
  globals.css            Tailwind v4 import + design tokens (@theme). --brand is
                         the white-label accent, overwritten at runtime.
  layout.tsx             root; wraps <AuthProvider>
  page.tsx               "/" → redirect to /dashboard or /login
  login/page.tsx         manager email+password login (NEUTRAL branding)
  (app)/                 route GROUP = the authenticated area (no URL segment)
    layout.tsx           client route guard + <AppShell>
    dashboard/page.tsx   stat cards + pending-payments + open-complaints panels
components/
  app-shell.tsx          sidebar nav (white-labeled) + topbar + sign-out
  stat-card.tsx          dashboard metric card
  ui/                    button, card, input/label, badge (shadcn-style, cn())
lib/
  api.ts                 PgApiClient singleton + localStorage TokenStore +
                         decodeToken (JWT) + currentUser; onUnauthorized → /login
  auth.tsx               <AuthProvider>/useAuth: login/logout, user, branding
  theme.ts               applyAccentColor → paints --brand from branding
  utils.ts               cn(), formatPaise (₹ from integer paise), formatDate
```

## Auth model (client-only)
- Manager logs in with **email + password** → `{ accessToken, refreshToken }`,
  persisted in `localStorage` (`pg_admin_access` / `pg_admin_refresh`).
- There is **no platform-admin login** and **no resident login here** — this app
  is managers only. (Resident OTP login belongs to the mobile app.)
- `decodeToken` reads (does NOT verify) the JWT for `role`/`tenantId`/`sub` —
  for routing + UI only. The API re-verifies every request.
- `(app)/layout.tsx` is the route guard: no user → `/login`. The real
  enforcement is server-side; this is just UX.
- 401 handling lives in `@pg/api-client`: single-flight refresh-on-401, and
  `onUnauthorized` (wired in `lib/api.ts`) hard-redirects to `/login`.

## White-labeling (the "feels bespoke" layer)
The login screen is **neutral** — pre-auth we don't know the tenant, so there's
no slug to theme from (`GET /branding/:slug` is for the *resident* app, where the
user types the slug). **After login**, `AuthProvider` calls
`GET /tenants/branding` (keyed off the JWT) and `applyAccentColor()` paints the
PG's `accentColor` into the `--brand` CSS variable. Everything that should feel
like "this PG" (primary buttons, active nav, focus rings) uses `bg-brand` /
`text-brand` / `ring-brand`. Logo (presigned `logoUrl`) shows in the sidebar.

## Adding a feature page (recipe)
1. Add the resource method(s) to `@pg/api-client` (`packages/api-client/src/
   client.ts`) — typed via `@pg/shared`. Verify the route path/verb against the
   actual NestJS controller (don't trust memory; several list endpoints take no
   query params).
2. Create `app/(app)/<feature>/page.tsx` as a `"use client"` component; fetch via
   the `api` singleton in `useEffect` (guard with a `cancelled` flag).
3. Detail/edit views: `?id=...` + client fetch, NOT `[id]` routes.
4. Flip the nav item's `ready: true` in `components/app-shell.tsx` (unbuilt items
   are shown disabled with a "soon" tag — keep that until the page exists).
5. `pnpm --filter @pg/admin build` to confirm the export still works + TS passes.

## Run / verify (local dev)
```bash
# prereq: infra up + migrated + API running
pnpm infra:up && pnpm db:migrate
node --env-file=apps/api/.env apps/api/dist/main.js   # or: pnpm --filter @pg/api dev
node apps/api/scripts/seed-demo.mjs                   # demo PG + data (prints login)

pnpm --filter @pg/admin dev      # http://localhost:3000  (login printed by seed)
pnpm --filter @pg/admin build    # static export → out/  (the real export check)
pnpm --filter @pg/admin typecheck
```
Demo login (from the seed): `manager@sunrise.pg` / `password123` (PG "Sunrise PG",
teal accent `#0d9488`). `NEXT_PUBLIC_API_URL` overrides the API base (default
`http://localhost:4000`). CORS for `:3000` is already in the API's `CORS_ORIGINS`.

## Status (M7, 2026-06-09)
**Done:**
- **Foundation** — api-client package, auth (login + context + guard),
  white-label theming, app shell, dashboard wired to live API. Verified: `next
  build` static export green, TS green, live login → branding → dashboard data
  (5 residents / 4 beds / 1 pending payment / 2 complaints) over real HTTP + CORS.
- **`components/ui/dialog.tsx`** (NEW primitive) — hand-rolled modal (backdrop +
  Esc close + body-scroll lock); used for all create/edit/confirm forms. No
  shadcn CLI, matches the other `ui/` primitives.
- **Rent page** (`(app)/rent/page.tsx`) — tabbed: **Payments** review queue
  (status filter; approve / reject-with-note / view-screenshot) + **Invoices**
  list with a **Generate invoices** dialog. Approving refetches invoices too
  (it flips the linked invoice to PAID). Nav `ready: true`.
- **Residents page** (`(app)/residents/page.tsx`) — one route, **two views via
  `?id=`** (list ↔ detail), Suspense-wrapped (required for `useSearchParams`
  under static export). List + **Register** dialog; detail has **bed allocation**
  (ranked-suggestions picker / move-out), **KYC documents** (verify / reject /
  download), **security deposit** (record + **settle-exit** with dynamic
  deduction rows and a live refund preview that blocks over-deduction). Nav
  `ready: true`.

**Verified (Rent + Residents):** `pnpm --filter @pg/admin typecheck` + `build`
(static export, both pages prerendered) + `@pg/api-client typecheck` — all green.
**Live click-through still pending** (needs Postgres via Docker; couldn't boot it
in the sandbox — run the seed flow above to exercise end-to-end).

- **PG-owner surface** (NEW) — a `PG_OWNER` owns multiple PGs. Owner login lands
  on **`/pgs`** (a chooser OUTSIDE the `(app)` shell — the global token has no
  active PG); opening a PG calls `owner.pgs.switch` → persists a PG-scoped token →
  enters `/dashboard` themed to that PG. The **global token is stashed**
  (`pg_owner_global_*` keys in `lib/api.ts`) so the topbar **"Switch PG"**
  (`exitPg`) returns to `/pgs` without re-login. Owner-only **`/managers`** page
  (add / deactivate, inside the shell) + owner-only nav item. Routing helpers
  `needsPgSelection`/`landingPath` (`lib/api.ts`); `useAuth` gains
  `isOwner`/`switchPg`/`exitPg`. **Build + backend-e2e verified; browser
  click-through deferred** (run `node apps/api/scripts/seed-owner.mjs` →
  `owner@pgowner.demo` / `password123`).

**Not started (next):** feature pages **property** (rooms/beds + edit-rent),
**complaints**, **menu**, **announcements**, **budgets**, **settings** (branding
editor) — all still nav stubs marked `soon`. Then the **mobile app** (Expo).
Also outstanding: **no committed frontend test yet** (dashboard/rent/residents
verified by build + manual click-through) — a Playwright admin e2e is a deferred
follow-up.

### Feature-page patterns (locked in by rent + residents)
- **Detail/edit views = `?id=` + client fetch**, never `[id]` routes. When a page
  reads `useSearchParams()`, wrap it in `<Suspense>` or `next build` fails the
  static export. Residents is the worked example (one `page.tsx`, list ↔ detail).
- Every mutation form lives in the **`Dialog`** primitive; on success the parent
  refetches (`load()`), then closes — no optimistic local mutation.
- **Money in, money out:** inputs are rupees → `Math.round(rupees * 100)` paise on
  submit; display via `formatPaise`. The API is always integer paise.
- No `Select`/`Textarea` primitives yet — use native `<select>`/`<textarea>` with
  the shared `inputClass` string (see residents page). Promote to `ui/` if reused.
