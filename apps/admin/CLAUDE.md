# CLAUDE.md — apps/admin (Next.js manager dashboard)

The PG **manager** web app — managers only (no platform-admin, no resident login;
resident OTP belongs to the mobile app). For business context + the API surface
see the root `CLAUDE.md` and `apps/api/CLAUDE.md`. This is a **pure client SPA** —
no server here; the NestJS API is the only trust boundary.

**Status: COMPLETE.** All eight nav pages built + verified (build / typecheck /
live-API / live-browser). No `soon` stubs remain. (The resident mobile app —
`apps/mobile/CLAUDE.md` — is also built + device-verified.) Outstanding: no
committed frontend test — admin is
build- + manual-verified; a Playwright e2e is the deferred safety net (the ad-hoc
`npx playwright` scripts with cached chromium are a ready template).

## Stack
Next.js 16 (App Router, **Turbopack**) · **`output: 'export'`** (static export) ·
React 19 · Tailwind CSS **v4** (`@tailwindcss/postcss`, no `tailwind.config` —
tokens in `app/globals.css` via `@theme`) · `lucide-react` · hand-rolled
shadcn-style primitives (no shadcn CLI). Types/validation from `@pg/shared`; all
HTTP via `@pg/api-client`.

## Static-export constraints (READ before adding pages)
`output: 'export'` builds to `out/` as plain HTML/JS. Consequences that bite:
- **No SSR / middleware / server-actions / route handlers.** Everything is
  `"use client"`; auth + data fetching happen in the browser only.
- **No file-based dynamic routes for runtime data** (`/residents/[id]` would need
  `generateStaticParams`, impossible per-tenant). **Detail views use a `?id=`
  query param + client fetch.** Any page reading `useSearchParams()` must be
  wrapped in `<Suspense>` or `next build` fails the export.
- `next dev` does NOT surface export violations — **only `next build` does.** Run
  `pnpm --filter @pg/admin build` after adding pages.
- `next/image` is `unoptimized`; plain `<img>` is fine for the presigned logo URL.
- `trailingSlash: true` → routes serve as `/dashboard/index.html`.

## Directory map
```
app/
  globals.css            Tailwind v4 import + design tokens (@theme). --brand is
                         the white-label accent, repainted at runtime.
  layout.tsx             root; wraps <AuthProvider>
  page.tsx               "/" → redirect to /dashboard or /login
  login/page.tsx         manager email+password login (NEUTRAL branding)
  pgs/page.tsx           PG_OWNER chooser (OUTSIDE the shell — global token)
  (app)/                 route GROUP = authenticated area (no URL segment)
    layout.tsx           client route guard + <AppShell>
    dashboard|residents|property|rent|complaints|menu|announcements|budgets|
    settings|managers/page.tsx
components/
  app-shell.tsx          sidebar nav (white-labeled, ownerOnly flags) + topbar
  ui/                    button, card, input/label, badge, dialog (cn())
lib/
  api.ts                 PgApiClient singleton + localStorage TokenStore +
                         decodeToken + currentUser; onUnauthorized → /login;
                         needsPgSelection/landingPath; owner global-token stash
  auth.tsx               <AuthProvider>/useAuth: login/logout, user, branding,
                         isOwner/switchPg/exitPg, refreshBranding
  theme.ts               applyAccentColor → paints --brand from branding
  utils.ts               cn(), formatPaise (₹ from integer paise), formatDate
```

## Auth model (client-only)
- Manager logs in with **email + password** → `{ accessToken, refreshToken }` in
  `localStorage` (`pg_admin_access`/`pg_admin_refresh`).
- `decodeToken` reads (does NOT verify) the JWT for `role`/`tenantId`/`sub` — for
  routing + UI only. The API re-verifies every request; `(app)/layout.tsx` route
  guard is UX, not enforcement.
- 401 handling lives in `@pg/api-client`: single-flight refresh-on-401, then
  `onUnauthorized` (wired in `lib/api.ts`) hard-redirects to `/login`.
- **PG_OWNER:** global token has no active PG → lands on `/pgs` (chooser outside
  the shell). Opening a PG calls `owner.pgs.switch` → PG-scoped token → enters
  `/dashboard`. Global token is stashed (`pg_owner_global_*`) so topbar "Switch
  PG" (`exitPg`) returns without re-login. Owner-only `/managers` (add/deactivate).

## White-labeling
Login is **neutral** (pre-auth there's no slug to theme from). **After login**,
`AuthProvider` calls `GET /tenants/branding` (keyed off the JWT) and
`applyAccentColor()` paints the PG's `accentColor` into `--brand`. Use
`bg-brand`/`text-brand`/`ring-brand` for anything that should feel like "this PG"
(primary buttons, active nav, focus rings). Logo (presigned `logoUrl`) shows in
the sidebar. Settings page edits this live via `refreshBranding()` (no reload).
(Mobile themes pre-auth via the public `GET /branding/:slug` instead.)

## Adding a feature page (recipe)
1. Add the resource method(s) to `@pg/api-client` (`packages/api-client/src/
   client.ts`), typed via `@pg/shared`. **Verify the route path/verb against the
   actual NestJS controller** — don't trust memory; several list endpoints take no
   query params.
2. Create `app/(app)/<feature>/page.tsx` as `"use client"`; fetch via the `api`
   singleton in `useEffect` (guard with a `cancelled` flag). Pick a pattern below.
3. Detail/edit views: `?id=` + client fetch, never `[id]`. Mutations live in the
   `Dialog` primitive; on success the parent refetches (`load()`), then closes —
   no optimistic local mutation.
4. `pnpm --filter @pg/admin build` to confirm export + TS pass.

## The four page patterns (locked in — pick one per page)
| Pattern | Worked example | When | `?id=`/Suspense? |
|---|---|---|---|
| **`?id=` detail** | residents, complaints | list ↔ one-record drill-down | yes |
| **Tree** | property | nested hierarchy *is* the view: load all levels in one `Promise.all`, group client-side by parent id, expansion in local `Set` | no |
| **Grid/range** | menu (week), budgets (month) | calendar/window data: hold window in local state, derive `from`/`to`, key results into a `Map` for O(1) cell render, click-cell upserts | no |
| **Flat feed** | announcements | small chronological records, no drill-down needed (show inline) | no |

## ⚠️ Recurring landmines (re-bite anyone, esp. dates)
- **Dates → API must be zero-padded LOCAL `YYYY-MM-DD`.** Write a `ymd()` helper
  (local getters + `padStart(2,"0")`); **never `toISOString().slice(0,10)`** — UTC
  is off-by-one in IST. Same for month periods: a local `ymPeriod`, **not**
  `toISOString().slice(0,7)`. Bit menu and budgets; both have local helpers now.
- **Money in/out:** inputs are rupees → `Math.round(rupees*100)` paise on submit;
  display via `formatPaise`. The API is always integer paise.
- **No `Select`/`Textarea` primitives** — use native `<select>`/`<textarea>` with
  the shared `inputClass`. Promote to `ui/` if reused.

## Page-specific notes (only the non-obvious)
- **Rent** — tabbed Payments review queue (approve / reject-with-note / view
  screenshot; approving flips the linked invoice to PAID, so refetch invoices too)
  + Invoices list with a Generate dialog.
- **Residents** — detail bundles bed allocation (ranked-suggestion picker /
  move-out), KYC docs (verify/reject/download), security deposit (record +
  settle-exit with live refund preview that blocks over-deduction).
- **Complaints** — no `GET /complaints/:id`; detail finds its row in
  `complaints.list()` + `complaints.updates(id)`. Thread entries carry only
  `authorUserId` → labelled Resident/You/Staff by comparing to `residentId`/JWT
  sub. "Assign to me" sends `{ assignToSelf: true }` with the (required) status.
  Backend slice driven here: `photoKey` on the summary + `GET /complaints/:id/photo`.
- **Menu** — a **cycle template**, not a calendar: `GET/PATCH /menu/config`
  (`cycleLengthWeeks` 1–3) + abstract `GET/POST /menu/slots`
  (weekNumber × dayOfWeek × mealType). Grid renders one cycle week at a time.
  (`GET /menu?from=&to=` materializes the cycle to real dates — that's the
  resident read.)
- **Budgets** — spend-vs-budget summary table (per-row progress bar, red when
  over) + expense ledger; free-text categories via a shared `<datalist>`. Expense
  date input is `min`/`max`-bounded to the viewed month (API buckets by
  `to_char(spent_on,'YYYY-MM')`; out-of-month would save but silently not appear).
- **Settings** — white-label editor (PG name + accent `<input type=color>` synced
  to hex, live preview; logo via presign → byte PUT → `PATCH {logoKey}`). Reads
  `useAuth().branding` (canonical). **Logo byte-PUT only works on real S3** (the
  local stub `uploadUrl` has no server); name/accent verify fully locally.

## Run / verify (local dev)
```bash
# prereq: infra up + migrated + API running
pnpm infra:up && pnpm db:migrate
pnpm --filter @pg/api dev
node apps/api/scripts/seed-demo.mjs        # demo PG + data (prints login)

pnpm --filter @pg/admin dev      # http://localhost:3000
pnpm --filter @pg/admin build    # static export → out/ (the real export check)
pnpm --filter @pg/admin typecheck
```
Demo login: `manager@sunrise.pg` / `password123` (PG "Sunrise PG", teal
`#0d9488`). Owner demo: `node apps/api/scripts/seed-owner.mjs` →
`owner@pgowner.demo` / `password123`. `NEXT_PUBLIC_API_URL` overrides the API base
(default `http://localhost:4000`); CORS for `:3000` is already configured.
Browser click-through recipe: `npx playwright` (chromium caches under
`~/.npm/_npx/.../playwright`, import by absolute path — it's CJS).
