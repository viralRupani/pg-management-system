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
| `deploy-frontend.mjs` | Builds a static frontend and syncs it to S3 (+ optional CloudFront invalidation). |
| `frontends.config.json` | Per-app S3 bucket / CloudFront distribution / build env for `deploy-frontend.mjs`. |

These are templates — replace the domains, passwords, buckets, and paths for your
box. Nothing here contains real secrets.

## Deploying admin / resident-web / landing to S3

**Note:** [`../docs/PRODUCTION.md`](../docs/PRODUCTION.md) §9 documents the
default path — build the Next.js static export and copy it to `/var/www/{admin,resident}`
on the same VPS that Caddy serves from. `deploy-frontend.mjs` is an **alternative**
S3 + CloudFront hosting path (the same pattern `apps/landing` already uses for the
marketing site) for when you'd rather host the frontends off the VPS. Pick one per
app — don't run both against the same domain.

1. Fill in the real bucket names (and CloudFront distribution IDs, if you're
   fronting with CloudFront) in `frontends.config.json` — `s3Bucket` values that
   still say `CHANGE_ME-...` will refuse to deploy.
2. Make sure the AWS CLI is configured (`aws configure`, or pass `--profile`) with
   write access to that bucket + `cloudfront:CreateInvalidation` if applicable.
3. Run:
   ```bash
   pnpm deploy:frontend admin            # builds @pg/admin, syncs apps/admin/out/ to S3
   pnpm deploy:frontend resident-web
   pnpm deploy:frontend landing
   ```
   Useful flags: `--skip-build` (reuse the last build), `--invalidate-cf` (also
   invalidate CloudFront — off by default, since HTML is short-cached
   `max-age=300` and expires on its own within 5 minutes; use this when you need
   the new deploy visible immediately), `--dry-run` (passes `--dryrun` to
   `aws s3 sync`, still runs the build), `--profile <name>`, `--bucket <name>`
   (override for a staging bucket).

If you go this route instead of the VPS static hosting, point that app's DNS
record at the CloudFront distribution (not the VPS) and drop the corresponding
block from `Caddyfile`.
