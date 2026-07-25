# deploy/

Ready-to-use production config for Basera. **Start with the full walkthrough:
[`../docs/PRODUCTION.md`](../docs/PRODUCTION.md).**

| File | What it is |
|---|---|
| `docker-compose.prod.yml` | Postgres 16 + Redis 7, bound to `127.0.0.1` only, hardened. |
| `basera-api.service` | systemd unit for the API (`node dist/main.js`; BullMQ worker runs in-process). |
| `Caddyfile` | Automatic-HTTPS reverse proxy for the API + static hosting for the admin/resident web apps. |
| `backup-db.sh` | Nightly `pg_dump` → offsite S3 bucket + local pruning. |
| `restore-db.sh` | Restore a dump (disaster recovery **and** the Phase-2 DB split). |
| `api.env.example` | Every production env var, annotated. Copy to `/etc/basera/api.env` (chmod 600). |

These are templates — replace the domains, passwords, buckets, and paths for your
box. Nothing here contains real secrets.
