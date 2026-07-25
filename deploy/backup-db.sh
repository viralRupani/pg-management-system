#!/usr/bin/env bash
#
# Nightly Postgres backup for Basera.
#
# Dumps the whole `pg_management` database in Postgres custom format (-Fc, already
# compressed + the input pg_restore wants), timestamps it, uploads to a SEPARATE
# S3 bucket (offsite — a lost server must not lose the backups), and prunes old
# local copies.
#
# Postgres is the ONLY critical stateful thing to back up: user files live in S3
# (never on this box) and Redis is rebuildable. So this script is the whole DR story.
#
# Schedule it (systemd timer or cron), e.g. daily at 02:30 IST:
#   30 2 * * *  /home/basera/pg-management-system/deploy/backup-db.sh >> /var/log/basera-backup.log 2>&1
#
# Requires: docker (to reach the postgres container) + awscli (aws s3), configured
# with an IAM principal that can write to $BACKUP_BUCKET.

set -euo pipefail

# ---- config (override via environment) ----------------------------------------
PG_CONTAINER="${PG_CONTAINER:-basera_postgres}"
PG_DB="${PG_DB:-pg_management}"
PG_USER="${PG_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/basera}"
BACKUP_BUCKET="${BACKUP_BUCKET:-s3://basera-db-backups}"   # a DIFFERENT bucket from user uploads
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
# -------------------------------------------------------------------------------

timestamp="$(date +%Y%m%d-%H%M%S)"
outfile="${BACKUP_DIR}/${PG_DB}-${timestamp}.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dumping ${PG_DB} from container ${PG_CONTAINER} ..."
# -Fc = custom (compressed) format; restore with pg_restore (see restore-db.sh).
# No `-t`/`-i`: a TTY would inject carriage returns and corrupt the binary dump.
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc "$PG_DB" > "$outfile"

size="$(du -h "$outfile" | cut -f1)"
echo "[$(date -Is)] wrote ${outfile} (${size})"

echo "[$(date -Is)] uploading to ${BACKUP_BUCKET} ..."
# --sse ensures server-side encryption at rest on the backup bucket.
aws s3 cp "$outfile" "${BACKUP_BUCKET}/${PG_DB}-${timestamp}.dump" --sse AES256

echo "[$(date -Is)] pruning local dumps older than ${LOCAL_RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name "${PG_DB}-*.dump" -type f -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "[$(date -Is)] backup complete."
# Offsite retention is enforced by an S3 lifecycle policy on $BACKUP_BUCKET
# (see docs/PRODUCTION.md — keep ~30–90 days + versioning).
