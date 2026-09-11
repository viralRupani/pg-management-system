# Basera — Production Deployment & Operations Guide

A top-to-bottom checklist for taking Basera live on **one small server**, with
**backups** and a clean **path to split the database and Redis onto their own
servers** as you grow. Follow it in order. Copy-paste config lives in
[`../deploy/`](../deploy/).

> **Rollout model this guide targets**
> - **Phase 1 (now):** API + Redis + Postgres on a single VPS.
> - **Phase 2 (after a few paying PGs):** move Postgres to its own server, then Redis.
> - The app only reaches Postgres/Redis over **TCP connection strings**, and user
>   files live in **S3 (never on the box)** — so Phase 2 is *repoint a URL + restart*,
>   not a rewrite. Nothing below bakes in co-location.

---

## Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [⚠️ Pre-launch blockers (read first)](#2-pre-launch-blockers-read-first)
3. [Provision the server](#3-provision-the-server)
4. [Install runtimes](#4-install-runtimes)
5. [AWS: S3 + SES + IAM](#5-aws-s3--ses--iam)
6. [Database + Redis](#6-database--redis)
7. [Deploy the API](#7-deploy-the-api)
8. [Bootstrap the platform admin](#8-bootstrap-the-platform-admin)
9. [Build + host the web frontends](#9-build--host-the-web-frontends)
10. [nginx + TLS](#10-nginx--tls)
11. [Backups](#11-backups)
12. [Phase 2 — splitting DB / Redis out](#12-phase-2--splitting-db--redis-out)
13. [Updating / redeploying](#13-updating--redeploying)
14. [Monitoring + hardening](#14-monitoring--hardening)
15. [Post-deploy verification checklist](#15-post-deploy-verification-checklist)

---

## 1. Architecture at a glance

```
                          Internet (80/443 only)
                                  │
                          ┌───────▼────────┐
                          │     nginx      │  reverse proxy
                          │  (+ certbot    │  + static file server
                          │   for TLS)     │
                          └───┬────────┬───┘
              api.basera.app  │        │  admin.basera.app / app.basera.app
                              │        └────────► /var/www/{admin,resident}  (static)
                    ┌─────────▼─────────┐
                    │  Basera API       │  systemd: node dist/main.js
                    │  (NestJS)         │  BullMQ worker runs IN-PROCESS
                    │  :4000 (localhost)│
                    └───┬───────────┬───┘
        DATABASE_URL /  │           │  REDIS_URL
   PLATFORM/MIGRATION   │           │
              ┌─────────▼──┐    ┌───▼────────┐        ┌──────────────┐
              │ Postgres16 │    │  Redis 7   │        │  AWS S3      │  KYC docs,
              │ 127.0.0.1  │    │ 127.0.0.1  │        │ (ap-south-1) │  payment pics,
              │ (docker)   │    │ (docker)   │        │  presigned   │  logos, QR
              └────────────┘    └────────────┘        └──────────────┘
                                                      AWS SES → transactional email
```

- **Only nginx is public** (ports 80/443). The API listens on `127.0.0.1:4000`;
  Postgres/Redis on `127.0.0.1` too. The firewall exposes only 22/80/443.
  Unlike Caddy, nginx doesn't obtain TLS certs itself — **certbot's nginx
  plugin** issues and auto-renews them (see §10).
- **BullMQ runs inside the API process** — the one systemd service is the whole
  backend (HTTP + scheduler + worker). Do **not** run a second API instance (two
  in-process workers would double-fire the cron jobs).
- **Timezone matters:** the scheduled jobs (invoice generation, reminders,
  overdue-marking, booking activation, billing snapshot) run in the *server*
  timezone and all billing math is IST — pin **`TZ=Asia/Kolkata`** everywhere.

**Versions:** Node **≥ 22**, pnpm **10.10.0** (both pinned in `package.json`).

---

## 2. ⚠️ Pre-launch blockers (read first)

Two things are **not** solved by configuration — they need a small code change
before the corresponding feature works in production. Don't discover these after launch.

### 2a. Resident phone-OTP login has no SMS delivery — **residents cannot log in**
The OTP is generated and stored in Redis, but there is **no SMS provider wired**
(`apps/api/src/auth/otp.service.ts` — the `SmsProvider` interface is a stub, never
implemented). In development the code is printed to the log; in **production those
dev logs are force-disabled**, so the code is never delivered by any channel.

**Required before residents can log in:** implement a real SMS driver (recommend
**MSG91** for India, or Twilio) and inject it into `OtpService.issue()`. This is a
~half-day code task, then set the provider's credentials as env vars.

> Managers/owners log in with email + password and are unaffected. The resident
> **email-verification** OTP is a *separate*, working channel (it goes over SES, see
> §5) — it does not substitute for SMS login.

### 2b. `trust proxy` is not set — rate-limiting is degraded behind nginx
The API doesn't trust the proxy's forwarded client IP, so the login/OTP throttler
buckets **all** clients under nginx's IP (one shared limit). One-line fix in
`apps/api/src/main.ts` before `app.listen`:

```ts
app.getHttpAdapter().getInstance().set("trust proxy", 1);
```

Not a hard blocker, but do it so brute-force protection works per-client.

> Lower priority (backlog, not blocking): a password change doesn't invalidate
> existing 30-day refresh tokens.

*(Ask the maintainer to knock out 2a + 2b — they're quick and both are code, not ops.)*

---

## 3. Provision the server

- **Where:** any Ubuntu 22.04/24.04 LTS VPS. Pick an **India region** for latency
  (DigitalOcean **BLR1**, AWS **Lightsail Mumbai**, or similar).
- **Size to start:** ~2 vCPU / 4 GB RAM / 80 GB SSD. Comfortable for one box running
  API + Postgres + Redis with headroom.

Initial hardening (as root, then switch to a normal user):

```bash
# 1. Create a non-root sudo user that will own the app + service
adduser basera && usermod -aG sudo basera

# 2. SSH keys only (copy your key first!), then disable password login
#    edit /etc/ssh/sshd_config: PasswordAuthentication no ; PermitRootLogin no
sudo systemctl reload ssh

# 3. Firewall — only SSH + web
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo ufw status                      # confirm 22/80/443 only

# 4. Auto security updates + fail2ban
sudo apt update && sudo apt install -y unattended-upgrades fail2ban
sudo dpkg-reconfigure --priority=low unattended-upgrades

# 5. Timezone (belt-and-suspenders; services also set TZ explicitly)
sudo timedatectl set-timezone Asia/Kolkata
```

---

## 4. Install runtimes

```bash
# Docker + compose plugin (for Postgres + Redis)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker basera            # log out/in for this to take effect

# Node 22 + pnpm 10.10.0 via corepack (as the basera user)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@10.10.0 --activate
node -v && pnpm -v                        # expect v22.x and 10.10.0

# nginx + certbot (TLS issuance/renewal — nginx itself has no built-in ACME client)
sudo apt install -y nginx certbot python3-certbot-nginx

# Backup/restore tooling (used by deploy/backup-db.sh + restore-db.sh):
#   awscli           → upload dumps to / fetch from S3 (runs on the host)
#   postgresql-client → host `pg_restore` / `psql` for restores + the Phase-2 split
#                       (pg_dump still runs inside the container via docker exec)
sudo apt install -y awscli postgresql-client
```

> The API build compiles native modules (`argon2`, `esbuild`, `sharp`) — these are
> already allowlisted in the repo's `pnpm.onlyBuiltDependencies`, so `pnpm install`
> builds them. If `argon2` ever fails to load, run `pnpm rebuild`.

---

## 5. AWS: S3 + SES + IAM

Both are **required for a functional launch** — file uploads and every
transactional email depend on them. Region: **ap-south-1 (Mumbai)**.

**S3 (file storage — KYC, payment screenshots, complaint photos, logos):**
1. Create a **private** bucket, e.g. `basera-uploads` (block all public access —
   everything is served via presigned URLs).
2. Add a **CORS** policy allowing `POST` + `GET` from your web origins:
   ```json
   [{"AllowedMethods":["POST","GET"],
     "AllowedOrigins":["https://admin.basera.app","https://app.basera.app"],
     "AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]
   ```
   (Without CORS, browser/app uploads fail with an opaque error.)
3. Create a **separate** bucket for DB backups, e.g. `basera-db-backups`
   (see §11) — enable **versioning** + a **lifecycle** rule (expire after 30–90 days).

**SES (email — password reset, resident email-verify OTP, notification emails):**
1. Verify a **domain identity** you own (not just an address) and enable **DKIM**.
2. Add the **SPF** record AWS gives you and a **DMARC** policy. (Un-authenticated
   mail lands in spam regardless of template quality.)
3. **Request production access** — a new SES account is in *sandbox* (can only send
   to verified recipients).
4. Pick a real From address on that domain, e.g. `no-reply@basera.app`.

**IAM (one key, used by both S3 and SES):**
- Create an IAM user with an access key. Grant: `s3:PutObject` + `s3:GetObject` on
  `arn:aws:s3:::basera-uploads/*`, `s3:PutObject` on `arn:aws:s3:::basera-db-backups/*`,
  and `ses:SendEmail` + `ses:SendRawEmail`.
- These become `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` in `api.env` (the API reuses
  the same key for S3 and SES). The `awscli` on the box (for backups) can use the
  same key via `aws configure`.

*(More detail on the AWS-side steps is inlined in `apps/api/.env.example`.)*

---

## 6. Database + Redis

Clone the repo and bring up Postgres + Redis:

```bash
cd ~ && git clone <your-repo-url> pg-management-system   # use a read-only deploy key
cd pg-management-system

# Compose env: superuser password + timezone
cat > deploy/.env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TZ=Asia/Kolkata
EOF
chmod 600 deploy/.env

docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps    # both healthy
```

On **first** init, `infra/init-db.sql` runs automatically and creates the two app
roles (`app_user` NOBYPASSRLS, `platform_user` BYPASSRLS) plus their default
privileges. The role model:

| Role | RLS | Used for | Connection string |
|---|---|---|---|
| `postgres` | owner | migrations only | `MIGRATION_DATABASE_URL` |
| `app_user` | **enforced** (NOBYPASSRLS) | all tenant requests | `DATABASE_URL` |
| `platform_user` | **bypassed** | platform/metering module only | `PLATFORM_DATABASE_URL` |

**Harden the app-role passwords** (init created them with known defaults). Set your
own and remember them for `api.env`:

```bash
docker exec -it basera_postgres psql -U postgres -d pg_management -c \
  "ALTER ROLE app_user PASSWORD '$(openssl rand -hex 24)';"
docker exec -it basera_postgres psql -U postgres -d pg_management -c \
  "ALTER ROLE platform_user PASSWORD '$(openssl rand -hex 24)';"
# (run each, capture the value it sets, put it in the matching URL in api.env)
```

> Postgres/Redis are bound to `127.0.0.1` — never reachable from the internet. The
> superuser password lives only in `deploy/.env`; the app-role passwords only in
> `/etc/basera/api.env`.

---

## 7. Deploy the API

```bash
cd ~/pg-management-system

pnpm install                              # installs workspace deps + builds native
pnpm --filter @pg/shared build            # must precede the API build/migrate
```

Install the environment file, then migrate and build:

```bash
sudo mkdir -p /etc/basera
sudo cp deploy/api.env.example /etc/basera/api.env
sudo chown basera:basera /etc/basera/api.env && sudo chmod 600 /etc/basera/api.env
sudo nano /etc/basera/api.env             # fill in EVERY CHANGE_ME (see the file's comments)
```

Run migrations (creates tables, enables RLS + policies, grants DML — **idempotent**,
safe to re-run; connects as the `postgres` superuser via `MIGRATION_DATABASE_URL`):

```bash
set -a && source /etc/basera/api.env && set +a   # load env for this shell
pnpm db:migrate
pnpm --filter @pg/api build               # → apps/api/dist/main.js
```

Install + start the service:

```bash
sudo cp deploy/basera-api.service /etc/systemd/system/basera-api.service
sudo nano /etc/systemd/system/basera-api.service   # fix WorkingDirectory + ExecStart node path (`which node`)
sudo systemctl daemon-reload
sudo systemctl enable --now basera-api
systemctl status basera-api
curl -s http://127.0.0.1:4000/health      # → {"status":"ok"}
```

---

## 8. Bootstrap the platform admin

The SaaS super-admin (you, the operator) has **no signup endpoint** — seed it once.
This also seeds Terms & Conditions v1.

```bash
cd ~/pg-management-system
set -a && source /etc/basera/api.env && set +a
PLATFORM_ADMIN_EMAIL="you@basera.app" \
PLATFORM_ADMIN_PASSWORD="<a strong password>" \
node apps/api/scripts/seed-platform-admin.mjs
```

From there: the **platform admin** onboards PG **owners**, and owners create their
PGs + managers through the app. (The other scripts — `seed.mjs`, `add-residents.mjs`
— are dev/demo only with hardcoded credentials; don't run them in production.)

---

## 9. Build + host the web frontends

Both admin and resident-web are **static exports** — pure HTML/JS served by nginx.

> **Critical gotcha:** `NEXT_PUBLIC_API_URL` is **baked in at build time**. You must
> set it before `next build`; you cannot change the API URL at runtime — a rebuild
> is required. If unset it hardcodes `http://localhost:4000`.

```bash
cd ~/pg-management-system

# Admin dashboard → admin.basera.app
NEXT_PUBLIC_API_URL=https://api.basera.app pnpm --filter @pg/admin build
sudo mkdir -p /var/www/admin && sudo rm -rf /var/www/admin/*
sudo cp -r apps/admin/out/* /var/www/admin/

# Resident web app / PWA → app.basera.app
NEXT_PUBLIC_API_URL=https://api.basera.app pnpm --filter @pg/resident-web build
sudo mkdir -p /var/www/resident && sudo rm -rf /var/www/resident/*
sudo cp -r apps/resident-web/out/* /var/www/resident/
```

**Landing site** (`@pg/landing`, a Vite static build → `apps/landing/dist/`): it has
its own S3 + CloudFront runbook in [`../apps/landing/DEPLOY.md`](../apps/landing/DEPLOY.md).
Use that, or serve it from this box by building it (`pnpm --filter @pg/landing build`),
copying `dist/` to `/var/www/landing`, and uncommenting the root-domain block in
`nginx.conf`.

---

## 10. nginx + TLS

Point DNS **A records** for `api.`, `admin.`, and `app.` (and root, if serving the
landing site) at the server's IP **first** — certbot needs to answer the HTTP-01
challenge on port 80.

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/basera
sudo nano /etc/nginx/sites-available/basera   # replace basera.app domains
sudo ln -s /etc/nginx/sites-available/basera /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default    # avoid the stock "Welcome to nginx" default_server clash
sudo nginx -t && sudo systemctl reload nginx

# Issue + install certs — certbot edits the file in place to add the 443
# server blocks and an HTTP->HTTPS redirect, and registers a renewal timer:
sudo certbot --nginx -d api.basera.app -d admin.basera.app -d app.basera.app
sudo systemctl status certbot.timer       # confirm auto-renew is scheduled
sudo journalctl -u nginx -f               # tail while you smoke-test
```

Confirm `CORS_ORIGINS` in `/etc/basera/api.env` lists the exact `https://admin.…`
and `https://app.…` origins, then `sudo systemctl restart basera-api`.

---

## 11. Backups

**Postgres is the only critical stateful thing.** User files live in S3 (off the
box); Redis is rebuildable (OTPs are short-lived and BullMQ repeatable jobs
re-register when the API boots). So the whole disaster-recovery story is nightly
Postgres dumps to a separate, offsite bucket.

Schedule `deploy/backup-db.sh` (it `pg_dump -Fc` → uploads to `basera-db-backups` →
prunes local copies). With cron:

```bash
sudo mkdir -p /var/backups/basera && sudo chown basera:basera /var/backups/basera
aws configure                             # the IAM key with s3 write to the backup bucket
crontab -e
# nightly at 02:30 IST (log to a path the `basera` user owns — /var/log is root-owned):
30 2 * * * /home/basera/pg-management-system/deploy/backup-db.sh >> /home/basera/basera-backup.log 2>&1
```

Backup policy:
- **Offsite bucket** `basera-db-backups` (different bucket than user uploads; ideally
  a different region). Enable **SSE encryption**, **versioning**, and a **lifecycle**
  rule to expire dumps after 30–90 days.
- **Redis:** AOF is on (`--appendonly yes` in the compose) so a restart doesn't drop
  in-flight OTPs — no offsite Redis backup needed.
- **S3 user files:** enable bucket **versioning** (protects against accidental /
  malicious deletes).
- **Secrets:** `/etc/basera/api.env` and `deploy/.env` are **not** in git — keep a
  copy in a password manager. Losing the JWT secrets logs everyone out.
- **Restore drills — do them.** A backup you've never restored isn't a backup:
  ```bash
  # pull the latest dump, restore into a scratch DB, smoke-test
  aws s3 cp s3://basera-db-backups/<latest>.dump /tmp/latest.dump
  docker exec basera_postgres createdb -U postgres pg_management_restore_test
  deploy/restore-db.sh /tmp/latest.dump \
    "postgres://postgres:<superpw>@127.0.0.1:5432/pg_management_restore_test"
  ```
- **Upgrade path (later):** when revenue justifies it, move to a managed Postgres
  with continuous/PITR backups, or add WAL archiving. Nightly dumps are the right
  start.

---

## 12. Phase 2 — splitting DB / Redis out

The app reaches Postgres/Redis **only** through connection strings and stores files
in S3, so scaling out is *stand up + repoint + restart* — **no code changes**.

### Splitting Postgres onto its own server
1. Provision the new Postgres (managed like **RDS ap-south-1**, or a second VPS).
2. Create the roles it needs **first** — run the role + grant statements from
   `infra/init-db.sql` against the new server (otherwise the restore can't apply
   ownership/grants).
3. Take a fresh dump and restore it:
   ```bash
   deploy/backup-db.sh                     # or a manual pg_dump -Fc
   deploy/restore-db.sh <dump> "postgres://postgres:PW@db.internal:5432/pg_management"
   ```
4. Update the **three** DB URLs in `/etc/basera/api.env`
   (`DATABASE_URL`, `PLATFORM_DATABASE_URL`, `MIGRATION_DATABASE_URL`) to the new host,
   with the hardened `app_user` / `platform_user` passwords set on the new server.
5. `pnpm db:migrate` once (reasserts RLS + grants), then
   `sudo systemctl restart basera-api`, run the verification checklist, and
   decommission the local Postgres container.
   - Do the cutover in a short maintenance window (stop the API, final dump/restore,
     repoint, start) so no writes are lost between dump and cutover.

### Splitting Redis onto its own server
Stand up the new Redis → change **`REDIS_URL`** in `api.env` → restart the API.
Redis is ephemeral (repeatable jobs re-register on boot), so there's no data to
migrate — at most a handful of in-flight OTPs are dropped.

### Moving the app server itself
It's stateless: build on the new box, point env at the same DB/Redis/S3, cut DNS.

---

## 13. Updating / redeploying

```bash
cd ~/pg-management-system
git pull
pnpm install
pnpm --filter @pg/shared build
set -a && source /etc/basera/api.env && set +a
pnpm db:migrate                            # take a manual dump FIRST — migrations are forward-only
pnpm --filter @pg/api build
sudo systemctl restart basera-api
curl -s http://127.0.0.1:4000/health

# Frontends (only if they changed) — rebuild with the prod API URL, recopy:
NEXT_PUBLIC_API_URL=https://api.basera.app pnpm --filter @pg/admin build
sudo rsync -a --delete apps/admin/out/ /var/www/admin/
NEXT_PUBLIC_API_URL=https://api.basera.app pnpm --filter @pg/resident-web build
sudo rsync -a --delete apps/resident-web/out/ /var/www/resident/
```

A brief API restart (a second or two) is acceptable on a single box. Always
`deploy/backup-db.sh` **before** running a migration so you can roll back the data
if something goes wrong (migrations don't auto-reverse).

---

## 14. Monitoring + hardening

- **Uptime:** external check on `https://api.basera.app/health` (UptimeRobot,
  BetterStack — free tiers are fine). Alerts to your phone/email.
- **Disk:** dumps + docker volumes fill disk over time. Alert at ~80%; the backup
  script prunes local dumps but watch `pg_data` growth.
- **Logs:** `journalctl -u basera-api` (API) and `-u nginx` (proxy, or
  `/var/log/nginx/{access,error}.log`). journald rotates by default; cap it in
  `/etc/systemd/journald.conf` (`SystemMaxUse=500M`) if needed.
- **Cert renewal:** `sudo systemctl status certbot.timer` should show it active;
  `sudo certbot renew --dry-run` rehearses a renewal without touching live certs.
- **Confirm the box isn't leaking DB/Redis:** from *another* machine,
  `nc -vz <server-ip> 5432` and `6379` should both **refuse/timeout** (only
  22/80/443 open).
- Keep `unattended-upgrades` + `fail2ban` running (from §3).

---

## 15. Post-deploy verification checklist

- [ ] `curl https://api.basera.app/health` → `{"status":"ok"}` over valid TLS.
- [ ] Manager can log in end-to-end from `https://admin.basera.app`.
- [ ] A **KYC doc / payment screenshot upload round-trips to S3** (proves
      `STORAGE_DRIVER=s3` + bucket CORS).
- [ ] A manager **password-reset email actually arrives** (proves SES live + DKIM,
      not stuck in sandbox/spam).
- [ ] **Resident phone-OTP login** — expected to **fail until the SMS driver ships**
      (§2a). Don't onboard residents before then.
- [ ] `bash deploy/backup-db.sh` puts an object in `s3://basera-db-backups`, and
      `deploy/restore-db.sh` restores it into a scratch DB cleanly.
- [ ] `systemctl status basera-api` active; nginx certs issued (`certbot
      certificates`) and `certbot.timer` active; `ufw status` shows only 22/80/443.
- [ ] From an external host, Postgres (5432) and Redis (6379) are **not** reachable.
- [ ] Rehearse the Phase-2 DB split once into a throwaway server **before** you need it.

---

### Appendix — full env var reference

Every variable, with defaults, is in [`../deploy/api.env.example`](../deploy/api.env.example)
and validated at boot by `apps/api/src/config/env.ts` (the API refuses to start if a
required one is missing). Hard-required: `DATABASE_URL`, `PLATFORM_DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Conditionally required: the four S3 creds
when `STORAGE_DRIVER=s3`; SES creds + region when `SES_FROM_EMAIL` is set.
