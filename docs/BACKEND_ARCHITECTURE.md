# Backend Architecture — Explained for a Non-Engineer

> This document exists because you built this by vibe coding and want to actually understand what's running. Read it top to bottom once, then use it as a reference. Everything here was verified against the actual code as of 2026-09-12, not just described in passing.

---

## 1. The one-sentence version

One NestJS server (`apps/api`) talks to one Postgres database and one Redis instance. It serves three frontends (manager web dashboard, resident mobile app, resident web app) over a JSON API, and also runs its own background job scheduler inside the same process — there is no separate worker server.

```
apps/admin (Next.js, manager dashboard)  ─┐
apps/mobile (Expo, resident app)          ├──►  apps/api (NestJS)  ──►  Postgres (5433)
apps/resident-web (Next.js, resident PWA)─┘            │                       ▲
apps/landing (marketing site, static)                  ├──►  Redis (6379)      │
                                                          │        (OTP codes,     │
                                                          │         password reset  │
                                                          │         tokens, cron     │
                                                          │         job queue)       │
                                                          ├──►  AWS S3 (files)        │
                                                          └──►  AWS SES (email)       │
                                                          └────── Postgres also runs
                                                                  the tenant-isolation
                                                                  rules (RLS) below
```

**Everything lives in one server process.** The cron/background-job engine (BullMQ) is not a separate service — it runs inside the same Node process as the API. This matters operationally: if you ever run two copies of the API for scaling, you'd double-fire every scheduled job unless that's explicitly handled (see §4, "critical gotcha").

---

## 2. The components, plainly

| Component | What it is | Where it runs | Why it exists |
|---|---|---|---|
| **NestJS API** (`apps/api`) | The only server. All business logic, all database access, all auth. | Your VPS, `node dist/main.js`, port 4000 (internal only) | Single source of truth — the frontends have no logic of their own, they're all "dumb" clients of this API. |
| **Postgres 16** | The database. | Docker container on the same VPS, port 5433 (dev) / bound to localhost only (prod) | Stores everything: residents, rooms, invoices, payments, etc. |
| **Redis 7** | An in-memory key-value store. | Docker container, port 6379 | Two jobs: (1) short-lived secrets — OTP codes, password-reset tokens; (2) the backing store for the cron/background-job queue (BullMQ). |
| **AWS S3** | File storage. | AWS cloud (ap-south-1 / Mumbai) | KYC documents, payment screenshots, complaint photos, PG logos, UPI QR codes. The API never stores files itself — it hands out short-lived upload/download links and the browser talks to S3 directly. |
| **AWS SES** | Transactional email sending. | AWS cloud | Password-reset emails, resident email-verification OTP codes. |
| **nginx** | Reverse proxy / TLS termination. | Your VPS, ports 80/443 | The only thing exposed to the internet. Routes traffic to the API and serves the static frontend builds. Also handles HTTPS certificates (via certbot). |

**What's notably *not* here, on purpose:** no payment gateway (residents pay by UPI outside the app and upload a screenshot for manual approval), no SMS provider actually wired up yet (see §7 — this is a real gap), no message queue other than BullMQ/Redis, no separate microservices — it's a deliberately simple, single-server monolith, which is the right call at this stage.

---

## 3. The database — every table and what it's for

Postgres is **multi-tenant**: every PG (hostel) is a "tenant," and one shared database holds every tenant's data, kept apart by a security feature called **Row-Level Security (RLS)** — think of it as a database-enforced wall so PG "Sunrise" can never accidentally see PG "Moonlight"'s residents, even if there's a bug in the app code. This is the single most important design decision in the whole system (see §6).

### Tables that belong to a specific PG (protected by RLS) — 29 tables

| Table | What it stores |
|---|---|
| `users` | Every person — manager or resident — within a PG |
| `buildings` / `floors` / `rooms` / `beds` | The property hierarchy: a PG has buildings → floors → rooms → beds |
| `allocations` | Which resident is in which bed, and the history of that |
| `transfer_requests` | Pending "move this resident to a different room" requests |
| `bookings` | A bed reserved for someone moving in on a future date |
| `short_stays` | Guests staying briefly, without a full resident profile |
| `invoices` | Monthly rent bills |
| `payments` | Payment screenshots submitted by residents, pending manager approval |
| `invoice_charges` / `extra_charges` | One-off or recurring extra charges a manager adds (e.g. damage fee) |
| `rent_adjustments` | Rent corrections from mid-month room transfers |
| `invoice_schedules` | Each PG's "auto-generate invoices on day X of the month" setting |
| `deposits` / `deposit_transactions` | Security deposit balances and the ledger of deductions/refunds |
| `documents` | KYC documents (ID proofs, photo) |
| `complaints` / `complaint_updates` | Resident complaints and the manager's responses |
| `menu_config` / `menu_slots` | The mess/food menu |
| `announcements` / `announcement_recipients` | Manager broadcasts to residents |
| `budgets` / `expenses` | PG expense tracking |
| `notifications` | The in-app notification feed |
| `push_tokens` | Resident phones' push-notification device tokens |
| `billing_snapshots` | Monthly snapshot of active-resident count (this is how *your* ₹10/resident platform fee is metered) |
| `referrals` | "Refer a friend" discount tracking |

### Tables that are NOT tied to any one PG (no RLS — these are platform-level) — 6 tables

| Table | What it stores |
|---|---|
| `tenants` | The PG organizations themselves (this is the "tenant" row each PG's data hangs off of) |
| `owners` | People who own multiple PGs (the "PG Owner" role) |
| `owner_tenants` | Which owner owns which PGs |
| `auth_identities` | Login credentials — email/phone + password hash. Deliberately has no RLS because login has to work *before* the system knows which PG you belong to. |
| `tc_versions` / `tc_acceptances` | Terms & Conditions versions you publish, and who's accepted them |

**Why 6 tables skip the tenant wall:** you can't check "which PG does this login belong to" using a security rule that itself requires knowing which PG you belong to — it's a chicken-and-egg problem. So login-related tables are handled carefully in application code instead. This is a normal, deliberate exception — not an oversight.

---

## 4. Background jobs (the "crons") — everything that runs on a timer

This is probably the part you have the least visibility into, since none of it is visible in any UI. All of it runs **inside the API process itself**, using a library called BullMQ (backed by Redis). There is no separate "worker server" — one important consequence: **if you ever scale to two API servers, you must make sure only one of them runs jobs, or every cron fires twice.** This is explicitly called out as a rule in your own production docs (`docs/PRODUCTION.md`).

| Job | Runs | What it does |
|---|---|---|
| **Invoice auto-generation dispatcher** | Every 15 minutes | Each PG can optionally set "generate my invoices on day X of the month, at time Y" (IST). This job checks every PG's schedule and fires invoice generation for any PG whose time has come and hasn't already run this month. If a PG has no schedule set, nothing happens — invoices stay manual (a button the manager clicks). |
| **Mark invoices overdue** | Daily, 8:00 AM | Flips any unpaid invoice past its due date from "Pending" to "Overdue." |
| **Complete short stays** | Daily, 12:30 AM | Automatically checks out short-stay guests whose stay period has ended and frees up their bed. |
| **Activate bookings** | Daily, 1:00 AM | A resident can be booked into a bed for a *future* move-in date. This job checks daily and "activates" the booking (makes it a real, billable allocation) once that date arrives. |
| **Activate room transfers** | Daily, 1:30 AM | Same idea, for pre-scheduled room transfers — executes the transfer once the target bed frees up. |
| **Rent reminders** | Daily, 9:00 AM | Sends a notification to any resident with an overdue/pending invoice. |
| **Monthly billing snapshot** | 1st of each month, 3:00 AM | Records the active-resident headcount for that PG — this is the number your ₹10/resident/month platform fee is calculated from. |

All of these run **per PG, one at a time**, inside that PG's own security context (so a job never accidentally reads across PGs) — and if one PG's job fails, the others still run.

There's also a manual "trigger this job right now" set of endpoints, restricted to you (the platform admin), useful for testing or fixing a PG that missed a scheduled run.

---

## 5. All the moving parts of the API (modules)

The API code is organized into ~28 "modules," each owning one slice of the product. You don't need to memorize these, but here's the map for when you want to find where something lives:

| Area | Handles |
|---|---|
| Auth | Manager login, resident OTP login, password reset |
| Platform | Your super-admin tools — onboarding new PGs, metering |
| Owner | The "owns multiple PGs" role — switching between PGs, managing managers |
| Residents | Registering and listing residents |
| Property | Buildings, floors, rooms, beds |
| Allocation | Assigning residents to beds, move-outs |
| Bookings | Future-dated bed holds |
| Short Stays | Transient guests |
| Storage | The S3 upload/download link generator |
| Rent | Invoices, payments, auto-scheduling, prorated rent math |
| Charges | Manager-added extra charges |
| Notifications | The notification feed + push |
| Jobs | The cron scheduler (§4) |
| Documents | KYC uploads and verification |
| Deposits | Security deposits and exit settlement |
| Complaints | Resident complaints |
| Menu | Mess menu |
| Announcements | Manager broadcasts |
| Budgets | Expense budgets |
| Branding | White-labeling — PG logo, colors, UPI/QR |
| Dashboard | The manager's stats/alerts homepage |
| Terms | Terms & Conditions acceptance gate |
| Referrals | Refer & earn |
| Mail | The email-sending layer (used by Auth for password reset, Residents for email verification) |

---

## 6. Security model — how one PG's data is kept from another

This is the most load-bearing design decision in the system, so it's worth understanding even at a high level. It works in layers, so that even if one layer had a bug, the others would still catch it:

1. **Database-level rule (RLS):** Postgres itself refuses to return rows for the wrong PG — this isn't application code, it's enforced by the database engine.
2. **Every request sets "which PG am I" once, from the login token:** never from anything the user typed or the URL — so there's no way to trick it by editing a request.
3. **Two different database logins:** the app's normal database user is *physically incapable* of bypassing the RLS rule (even with a bug); only your platform-admin backend code uses a separate, more powerful login, and only for cross-PG operations like the cron dispatcher.
4. **Relationships between tables carry the PG id too**, so it's structurally impossible for one PG's room to reference another PG's building, etc.
5. **Within a PG, residents are further kept from seeing each other's data** by application code checking "is this record actually yours" on every resident-facing request.

Bottom line: this is a genuinely solid multi-tenant design, on par with what a well-funded SaaS company would build. You don't need to worry about "did the AI cut corners here" — this part was clearly built carefully.

---

## 7. Things that need YOUR attention

These are real, currently-open gaps — not hypothetical. Ranked by how much they'll bite you:

### 🔴 Residents cannot actually receive their login OTP in production
The code that would send an SMS with the login code is a stub — it doesn't call any real SMS provider (no Twilio, no MSG91, nothing). In development, the OTP is just printed to a log file, which obviously doesn't work for a real resident on their phone. **Until you (or someone) wires up a real SMS provider, no resident can log into the mobile or web app in production.** This is flagged in your own `docs/PRODUCTION.md` as a launch blocker.

### 🟠 Rate-limiting will misbehave once nginx is in front of it
The login/OTP throttling (e.g. "max 5 login attempts per minute") counts by IP address. But once traffic goes through nginx (which it does in production), the API sees nginx's IP for *every* user, not each person's real IP — so the rate limit effectively becomes "5 attempts per minute for the whole app combined," which could lock out real users during any burst of traffic. This needs a one-line "trust proxy" config fix.

### 🟡 Rate-limit counters are stored in memory, not Redis
Right now, throttling counts reset every time the API restarts, and if you ever run more than one API instance, each instance has its own separate counter (so limits become easier to bypass). Fine for one server; would need fixing before horizontal scaling.

### 🟡 A cancelled/updated move-out doesn't always reverse billing correctly
Two related known gaps, both documented in your backlog:
- If a resident's move-out is approved and a later month gets auto-settled from their deposit, then the move-out date is pushed back afterward, the system does **not** un-settle that month. Manual fix needed if this happens.
- If a resident is mid-transfer between rooms and exits before the next billing cycle, a pending rent adjustment can be silently dropped instead of applied.

Both are edge cases (not everyday occurrences) but worth knowing about if a resident's final bill ever looks wrong.

### 🟡 Push notifications aren't real yet
The "send a push notification to the resident's phone" code is currently a stub that just logs instead of calling Apple/Google's push service. Email is standing in as the actual notification channel for now (see below) — which works, but isn't as immediate as a real push notification.

### ⚪ "Decommission a bed" has no button yet
If a bed becomes permanently unusable (damaged, room repurposed), there's no clean way to remove it from the system yet — it needs a small new feature.

---

## 8. What's already handled well (so you don't lose sleep over it)

- **Email** is fully wired to AWS SES for password resets and resident email-verification codes — this works today, provided SES credentials are set in production.
- **File uploads** (KYC docs, payment screenshots) go straight to S3 via secure, short-lived links — the API server itself never touches the file bytes.
- **Money is stored as integer paise everywhere** (never floating-point), which avoids an entire class of "why is this bill off by ₹0.01" bugs.
- **Database backups** are scripted (`deploy/backup-db.sh`) — nightly dump to a separate offsite S3 bucket. Redis doesn't need backing up (it only holds short-lived, regenerable data plus the cron schedule, which rebuilds itself on restart).
- **All 297 automated backend tests pass** as of the last check — this is a genuinely well-tested codebase for its size, which is not typical of vibe-coded projects.

---

## 9. Where things physically run (production)

- **One VPS** runs: the API (as a background service that auto-restarts if it crashes), Postgres, Redis, and nginx.
- **nginx** is the only thing exposed to the public internet (ports 80/443) — it forwards API requests to the API (which only listens locally) and serves the built manager/resident web apps as static files.
- **Postgres and Redis** are only reachable from inside the server itself — not exposed to the internet.
- **S3 and SES** are the only pieces that live outside your VPS, in AWS's cloud (Mumbai region).

---

## 10. Glossary (for the vibe-coder)

- **RLS (Row-Level Security):** A Postgres feature where the database itself filters out rows you're not allowed to see, even if the application code forgets to ask.
- **Tenant:** One PG/hostel, in the technical sense — "multi-tenant" means one system serving many independent PGs.
- **RLS/tenant context:** "Which PG is this request for" — set once per request from the login token, never trusted from user input.
- **BullMQ:** The library that runs your cron jobs, backed by Redis.
- **Presigned URL:** A temporary, secure link that lets a browser upload/download a file directly to/from S3 without the file passing through your API server.
- **JWT (JSON Web Token):** The login token format — an access token (short-lived, 15 min) and a refresh token (30 days) that renews it.
