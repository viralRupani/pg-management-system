---
name: backend-audit
description: >-
  Run a thorough, senior-engineer audit of the backend application — sweeping
  for security vulnerabilities, tenant-isolation breaks, bugs, race conditions,
  edge cases, and performance problems, then producing a severity-ranked
  findings report and running the test suite to confirm green. Use this whenever
  the user wants to "audit", "review the backend", "check for vulnerabilities /
  security risks / bugs / performance issues", "verify the whole application",
  do a "code health check", "harden" the API, or asks for a recurring/regular
  sweep of the server code — even if they don't say the word "audit". Prefer
  this over an ad-hoc read-through whenever the request is about the *overall
  correctness and safety* of the backend rather than one specific file or
  feature.
---

# Backend Audit

You are acting as an experienced backend engineer doing a security and
correctness review of an entire backend application. The person asking trusts
you to find the things they'd be embarrassed to ship — auth holes, data leaks
across tenants, money-handling bugs, concurrency races, and the slow query that
falls over at scale. Your job is to find real problems, prove they're real, and
report them so they can be acted on. An audit that cries wolf is worse than no
audit at all, so **every finding must be backed by evidence the reader can
verify in seconds.**

## What makes this hard (read before you start)

The repo's own docs (`CLAUDE.md`, `apps/api/CLAUDE.md`, `docs/backlog.md`) are
loaded into your context automatically. It is tempting to just paraphrase the
"known issues" from the backlog and call it an audit. **Don't.** The user can
read their own backlog. Your value is in *reading the actual code* and finding
what the docs don't already say — the violation that crept in since the doc was
written, the edge case nobody wrote down, the endpoint that quietly trusts the
request body. Treat the docs as a map of where the landmines are *supposed* to
be, then go check whether the code actually holds the line.

## The audit, in four phases

### Phase 1 — Orient (don't skip, don't over-invest)
Get the lay of the land so your sweep is grounded in how *this* codebase is
actually wired, not a generic template.

- Read the project's `CLAUDE.md` files and any backlog/security docs. They tell
  you the invariants the system depends on and the issues already known. Known
  issues are *lower* priority to re-report — note them as "still open" in one
  line, don't write a paragraph rediscovering them.
- Map the surface area: list the modules/route handlers, the data layer, auth,
  background jobs, and any place that touches money, files, or other tenants.
- If a project-specific invariants file ships with this skill
  (`references/project-invariants.md`), read it — it distills the load-bearing
  rules and the red flags that signal a violation. Check whether it still
  matches the canonical `CLAUDE.md`; if they've drifted, trust the code.

### Phase 2 — Sweep in ordered passes
Whole-codebase reviews fail by going wide and shallow — skimming everything,
catching nothing. Force depth by making **one focused pass per concern** across
the whole backend before moving to the next. For each pass, go to the code,
read the handlers/queries involved, and write down what you find. The passes,
roughly in priority order:

1. **AuthN / AuthZ** — Is every route's auth what it claims? Look for missing
   role guards, routes that should be protected but are marked public, role
   checks that can be bypassed, token/secret handling, and privilege escalation
   between roles.
2. **Tenant / data isolation** — In a multi-tenant system this is the highest-
   blast-radius failure. Can one tenant's request read or write another's data?
   Trace where the tenant identity comes from (it must come from the verified
   token, never request input) and whether every query is actually scoped.
3. **Ownership within a tenant** — Isolation between tenants does not isolate
   *users* within one. For any endpoint a lower-privilege actor calls, is the
   actor id taken from the verified identity (token `sub`) and used to scope the
   query — or is an id read from the body/params and trusted? The classic bug:
   `GET /thing/:id` that returns anyone's thing.
4. **Money / correctness of critical writes** — Currency math, rounding, units
   (this codebase is integer paise — any float/`numeric` on money is a bug),
   double-charging, and any write whose correctness people depend on.
5. **Concurrency & state transitions** — Status flips with side effects
   (approve, settle, exit, allocate). Are they done as a conditional UPDATE
   guarded on rows-affected, or as a racy select-then-update? Look for
   "at most one active X" rules that a concurrent request could violate.
6. **Input validation & edge cases** — Unvalidated bodies, missing bounds,
   null/empty/oversized inputs, pagination limits, and the off-by-one and
   empty-list cases. Does every endpoint validate its input against a schema?
7. **Resource handling** — File storage (store keys not URLs; presign on read),
   secrets in logs, unbounded queries, N+1 patterns, missing indexes on
   filtered/joined columns, and queries that scan when they should seek.
8. **Error handling & failure modes** — Swallowed errors, leaked internals in
   responses, partial writes without a transaction, and batch jobs where one
   failure aborts the rest or crosses tenant boundaries.

You don't have to treat these as rigid silos — if you're in a file and spot a
money bug during the auth pass, write it down. The passes are there to guarantee
coverage, not to box you in.

### Phase 3 — Run the test suite
A static read is half the picture. Run the project's tests and report the
result as part of the audit — a passing suite is evidence; a failing or
un-runnable one is itself a finding.

- Find the test command (check the project docs / `package.json` scripts).
- **Tests here may need infrastructure** (this project: Postgres on :5433 +
  Redis, migrated, and the suite runs serialized). Before running, check whether
  that infra is up. If it is, run the suite and report pass/fail counts. If it
  isn't, **do not silently skip** — either bring it up if that's cheap and safe
  (`pnpm infra:up && pnpm db:migrate`), or record in the report: *"Test suite
  not run — infra (Postgres/Redis) was down."* The reader needs to know whether
  green was actually observed.
- If tests fail, capture the failing output. Don't paper over it.
- Note coverage gaps you can see by eye: a critical path (auth, isolation,
  money) with no test is a High finding even if everything that *is* tested
  passes.

### Phase 4 — Report
Write the findings to a file so the audit is durable and recurring runs are
comparable — see the report format below.

## Discipline: prove it or drop it

The fastest way to make this audit worthless is to pad it with plausible-sounding
issues you didn't verify. Before any finding goes in the report:

- **Cite `file:line`.** If you can't point to the exact line, you haven't found
  it yet — go find it or cut it.
- **State the concrete consequence**, not a category. Not "potential SQL
  injection" but "tenant A can read tenant B's invoices via this query because
  the tenant id comes from `req.body`, line X."
- **Separate what you confirmed from what you suspect.** A real, traced bug and
  a hunch are different things; label the hunch as "needs verification" and put
  it lower. Never inflate a hunch to Critical to seem thorough.
- If you went looking for a class of bug and the code handles it correctly, that
  is worth one line in the report too — it tells the reader you checked.

## Report format

Write the report to `reports/backend-audit-<YYYY-MM-DD>.md` in the repo (create
the `reports/` dir if needed). Use this structure:

```markdown
# Backend Audit — <date>

## Summary
- One paragraph: overall health, the headline risks, and whether the test suite
  passed (or why it wasn't run).
- Counts: Critical: N · High: N · Medium: N · Low: N

## Test suite
- Command run, pass/fail counts, or why it couldn't run.

## Findings
For each, in severity order (Critical → Low):

### [SEVERITY] Short title
- **Where:** `path/to/file.ts:line`
- **What:** the concrete bug and how it triggers.
- **Impact:** what an attacker/unlucky-user gets, or what breaks.
- **Fix:** the specific change to make.
- **Confidence:** confirmed by reading the code / needs verification.

## Still-open known issues
- One line each for backlog items you re-confirmed are still present (don't
  re-explain them).

## Checked and OK
- One line each for risk classes you specifically verified are handled well.
```

**Severity guide:** Critical = data leak across tenants, auth bypass, money
loss, or remote code execution. High = privilege escalation within a tenant,
data corruption, an unguarded race on a critical write, or a critical path with
no test. Medium = edge-case bug, missing validation with limited blast radius,
or a real performance problem under load. Low = hygiene, minor inefficiency,
defensive-depth suggestions.

## Recurring runs

This skill is meant to be run regularly, so make consecutive reports
*comparable* rather than noisy:
- Keep dated report files; don't overwrite the previous one.
- If a prior `reports/backend-audit-*.md` exists, read the most recent one first
  and **lead the summary with what's new or newly fixed since then.** A finding
  that's been open and acknowledged for three runs shouldn't shout as loud as a
  regression that appeared today.
- If the project records accepted/won't-fix issues (e.g. in the backlog), don't
  keep re-raising them as Critical — acknowledge them as known and move on.
