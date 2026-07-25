#!/usr/bin/env bash
#
# Restore a Basera Postgres dump (from backup-db.sh) into a target database.
#
# Two uses:
#   1. Disaster recovery / restore drill — restore into a scratch DB and smoke-test.
#   2. Phase-2 migration — restore onto a NEW Postgres server when splitting the DB
#      off the app box (see docs/PRODUCTION.md "Splitting Postgres out").
#
# IMPORTANT: the target server must already have the roles the dump references
# (app_user, platform_user, postgres). On a brand-new server, create them FIRST by
# running infra/init-db.sql's role statements (see the guide), otherwise pg_restore
# emits "role ... does not exist" errors and object ownership/grants won't apply.
#
# Usage:
#   ./restore-db.sh <dump-file> <target-psql-url>
# Example (drill into a scratch DB in the local container):
#   docker exec -e PGPASSWORD=... basera_postgres createdb -U postgres pg_management_restore_test
#   ./restore-db.sh /var/backups/basera/pg_management-20260725-023000.dump \
#       "postgres://postgres:PW@127.0.0.1:5432/pg_management_restore_test"
# Example (Phase-2, onto a fresh managed DB):
#   ./restore-db.sh ./pg_management-latest.dump \
#       "postgres://postgres:PW@db.internal:5432/pg_management"

set -euo pipefail

DUMP_FILE="${1:?usage: restore-db.sh <dump-file> <target-psql-url>}"
TARGET_URL="${2:?usage: restore-db.sh <dump-file> <target-psql-url>}"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "dump file not found: $DUMP_FILE" >&2
  exit 1
fi

echo "[$(date -Is)] restoring ${DUMP_FILE} into target ..."
# --clean --if-exists: drop existing objects first (idempotent re-restores).
# --no-owner --role=postgres: recreate owned by the superuser; the migrate step's
# grants + init-db default privileges hand DML to app_user/platform_user.
# RLS policies are part of the schema and come across with the dump.
pg_restore \
  --clean --if-exists \
  --no-owner --role=postgres \
  --dbname="$TARGET_URL" \
  "$DUMP_FILE"

echo "[$(date -Is)] restore complete."
echo "Next: point DATABASE_URL / PLATFORM_DATABASE_URL / MIGRATION_DATABASE_URL at"
echo "the target, run 'pnpm db:migrate' once to reassert RLS + grants, then restart"
echo "the API and run the verification checklist."
