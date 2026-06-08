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

## Status (M7, 2026-06-08)
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

- **Property page** (`(app)/property/page.tsx`) — an expandable **building →
  floor → room → bed tree**. Loads all four levels unfiltered and groups
  client-side by parent id (small per PG; beats fetch-on-expand, and expansion is
  local `useState` so no `useSearchParams`/Suspense needed — this is the **tree**
  pattern, distinct from residents' `?id=` detail pattern). Create dialog at
  every level + **edit-rent** inline (click a room's rent chip). Room-create puts
  **rent + capacity up front as required** (rent defaults to 0 in the schema and
  feeds `generateMonthly` — don't bury it); prefs optional. Bed status badges
  (VACANT/OCCUPIED/RESERVED). Extended `@pg/api-client` `property`
  (floors/beds/createFloor/createBed/updateRoomRent). Nav `ready: true`.
  - **Deferred:** *rename* + *decommission-bed* (promised in the M2 follow-up) are
    NOT built — no API endpoints exist yet. Page ships on create/list/edit-rent.

- **Complaints page** (`(app)/complaints/page.tsx`) — list ↔ detail via `?id=`
  (residents pattern, Suspense-wrapped). List: status-filter chips (Open / In
  progress / Resolved / All) filtering one fetch client-side. Detail: header +
  **triage** (set status; **Assign to me** sends `{ assignToSelf: true }` with the
  current status, since the status schema field is required) + **photo view** +
  **comment thread** (read + add note). **No `GET /complaints/:id`** exists, so
  detail finds its row in `complaints.list()` + `complaints.updates(id)` (one
  `Promise.all`). Thread entries only carry `authorUserId` → labelled Resident /
  You / Staff by comparing to `complaint.residentId` and the JWT sub. Extended
  `@pg/api-client` `complaints` (updates / addUpdate / updateStatus / photo). Nav
  `ready: true`.
  - **Backend slice (this app drove it):** added `photoKey` to the complaint
    summary (read projection, **no migration**) + manager `GET
    /complaints/:id/photo` (presigned download, mirrors payments `:id/screenshot`).

- **Menu page** (`(app)/menu/page.tsx`) — a **weekly grid** (meals ×
  Mon–Sun), prev/this-week/next nav, week state purely local so **no
  `?id=`/Suspense**. Click a cell → dialog upserts that date+meal (`POST /menu`),
  refetches the week (`GET /menu?from=&to=`). Pure-frontend; added the `menu`
  resource to `@pg/api-client`. **🔑 Both menu endpoints reject unpadded dates**
  (`GET` regex `\d{4}-\d{2}-\d{2}`, `POST` Zod `.date()`) → the `ymd()` helper
  zero-pads + uses **local** getters (not `toISOString`, UTC-shifts in IST), and
  the same `ymd` feeds both the range query and the upsert `menuDate`. No delete
  endpoint + `items` is `min(1)`, so the dialog blocks blank (overwrite, not
  clear). Nav `ready: true`.

- **Dashboard panels are now clickable** — "Open complaints" rows link to
  `/complaints?id=`, "Payments awaiting review" rows to `/rent` (no per-payment
  detail route exists). Wrapped each `<li>` content in `next/link`, same
  hover-row styling as the list pages.

- **Announcements page** (`(app)/announcements/page.tsx`) — the simplest page
  yet: a flat reverse-chronological feed (`GET /announcements`, already
  newest-first server-side) + a **New announcement** dialog (`POST
  /announcements`). No grid, no `?id=`/Suspense, no detail route — body shown
  inline with `whitespace-pre-wrap` (max 4000 chars), so a drill-down would add
  nothing (unlike complaints, where the thread justified one). `title`/`body`
  inputs mirror the API's `maxLength` (160 / 4000) and both block blank submits.
  Pure-frontend — `AnnouncementsModule` + Zod schemas were already built in M5.
  Added a 2-method `announcements` resource (`list`/`create`) to
  `@pg/api-client`. Nav `ready: true`.

- **Budgets page** (`(app)/budgets/page.tsx`) — the **grid/range pattern at
  month granularity** (menu is the week-level sibling): the viewed month lives in
  local `useState`, `period = ymPeriod(month)` is derived, and one `useEffect`
  fetches `Promise.all([budgets.summary(period), budgets.expenses(period)])`. No
  `?id=`/Suspense (window state is local). Layout = month nav (prev/this/next) +
  a **spend-vs-budget summary table** (Category | Budget | Spent | Remaining,
  per-row progress bar that turns `bg-danger` + red Remaining when over, `—`
  where `limitPaise` is null, plus a Σ Total footer) + an **expense ledger**. Two
  `Dialog`s: **Set budget** (upsert) and **Record expense**. **Categories are
  free text** — both dialogs' category inputs share a `<datalist
  id="budget-categories">` built from the period's known categories (reuse or
  type new). Pure-frontend; added a 4-method `budgets` resource (summary /
  setBudget / expenses / recordExpense) to `@pg/api-client`. **🔑 Period uses a
  local `ymPeriod` helper (NOT `toISOString().slice(0,7)` — UTC shifts the month
  in IST, same landmine as menu's `ymd`)**; `spentOn` defaults via local `ymd`.
  The expense **date input is `min`/`max`-bounded to the viewed month** — the API
  buckets expenses by `to_char(spent_on,'YYYY-MM')` and the page only refetches
  the viewed period, so an out-of-month date would save but silently not appear
  (looks like a failed save → duplicate re-entry). No delete endpoint
  (set/overwrite only; budget `limitPaise≥0`, expense `>0`). Nav `ready: true`.

- **Settings page** (`(app)/settings/page.tsx`) — the **white-label branding
  editor**, the last admin page. Reads `useAuth().branding` (canonical, fetched
  at login) rather than its own fetch, so **no `?id=`/Suspense**. An **Identity**
  card (PG name + accent colour: a native `<input type="color">` synced to a hex
  text field, with a **live `AccentPreview`** of primary-button / active-nav /
  swatch) → one `PATCH /tenants/branding`; and a **Logo** card (object-URL local
  preview → `POST /tenants/logo-url` presign → `fetch` PUT the bytes → `PATCH {
  logoKey }`). On any save it calls **`useAuth().refreshBranding()`**, which
  re-reads `/tenants/branding` and repaints `--brand` + the sidebar **live** (no
  reload). **No api-client change** — `branding.mine/update/logoUploadUrl` existed
  from the foundation. **🔑 First file upload in the admin app**: the local
  storage stub's `uploadUrl` (`stub-storage.local`) has no real server, so the
  **byte PUT only works on real S3** — name/accent verify fully locally, the logo
  is verified at the API/presign level (key-not-URL pattern, like payments/KYC).
  Nav `ready: true`.

**Verified (all eight pages):** `pnpm --filter @pg/admin typecheck` + `build`
(static export, all pages prerendered) + `@pg/api-client typecheck` — green.
**Complaints + Menu live-API-verified** (infra booted this session — Postgres
5433): full `pnpm --filter @pg/api test` 64/6 green incl. the photo round-trip;
live login confirmed complaints list returns `photoKey` + `:id/photo` 404s with no
photo; and a live menu **upsert → range read → re-upsert-replaces (1 row)**
round-trip confirmed the zero-padded date handling end-to-end.
**🔑 Announcements is the first page with a real live *browser* click-through**
— `npx playwright` (chromium was already cached locally, so the earlier
"Docker/sandbox" blocker for browser automation didn't apply here): logged in as
the seed manager, posted one announcement via raw API + one via the UI dialog,
screenshotted both the dialog and the resulting feed — confirms the white-label
`--brand` theming, `formatDate`, and newest-first ordering all work end-to-end in
a real browser. **This closes the "live browser click-through pending" gap noted
on every prior M7 page** — re-use this `npx playwright` + cached-chromium recipe
for budgets/settings instead of assuming it's blocked.
**🔑 Budgets is the second page with a live *browser* click-through** (reused the
recipe above — chromium cached in `~/.npm/_npx/.../node_modules/playwright`,
imported by absolute path since it's CJS): logged in as the seed manager, drove
**Set budget + Record expense via the UI dialogs**, and asserted the summary's
Spent/Remaining update live (₹5,000 limit → spent ₹1,200 → recorded ₹5,000 →
spent ₹6,200, Remaining went **red** over budget), the active-nav teal
(`rgb(13,148,136)`), and the empty state on an untouched month — zero console
errors. (Side effect: the seed PG now carries a few `Utilities` test expenses;
there's no delete endpoint to clean them, harmless on the demo PG.)

**🎉 Admin app COMPLETE** — all eight nav pages built + verified; no `soon` stubs
remain. Next surface is the **resident mobile app (Expo)**. Still outstanding:
**no committed frontend test yet** (admin pages verified by build +
manual/live-API/live-browser checks) — a Playwright admin e2e is a deferred
follow-up (the ad-hoc scripts driven this milestone are a ready template).

### Feature-page patterns (locked in by rent + residents)
- **Detail/edit views = `?id=` + client fetch**, never `[id]` routes. When a page
  reads `useSearchParams()`, wrap it in `<Suspense>` or `next build` fails the
  static export. Residents is the worked example (one `page.tsx`, list ↔ detail).
- **Nested/hierarchical data = the tree pattern** (property is the worked
  example): load every level unfiltered in one `Promise.all`, group client-side
  by parent id (`Map<parentId, child[]>`), render nested with expansion held in
  local `Set<string>` state. Cheaper than fetch-on-expand for small datasets and
  needs no `?id=`/Suspense. Use `?id=` for drill-down detail; use the tree when
  the *structure* is the view.
- **Calendar/range data = the grid pattern** (menu is the worked example): hold
  the window (e.g. week) in local state, derive `from`/`to`, fetch the range, key
  results into a `Map` for O(1) cell render, click-a-cell to upsert. **Any date
  sent to the API must be zero-padded local `YYYY-MM-DD`** — write a `ymd()`
  helper (local getters + `padStart(2,"0")`), never `toISOString().slice(0,10)`
  (UTC, off-by-one in IST). No `?id=`/Suspense (window state is local).
- **Flat chronological feed = the simplest pattern** (announcements is the
  worked example): one unfiltered `list()` fetch into local state, render as a
  stack of `Card`s, a single "New" button opens a create `Dialog`. No window
  state, no `?id=`/Suspense, no detail route — show the full record inline if
  it's small enough that drilling down would add nothing.
- Every mutation form lives in the **`Dialog`** primitive; on success the parent
  refetches (`load()`), then closes — no optimistic local mutation.
- **Money in, money out:** inputs are rupees → `Math.round(rupees * 100)` paise on
  submit; display via `formatPaise`. The API is always integer paise.
- No `Select`/`Textarea` primitives yet — use native `<select>`/`<textarea>` with
  the shared `inputClass` string (see residents page). Promote to `ui/` if reused.
