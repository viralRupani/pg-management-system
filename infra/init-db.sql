-- Bootstrap roles for multi-tenant RLS.
-- Runs once on first container init (before any migrations).
--
-- Role model:
--   postgres      -> superuser, OWNS the schema/tables, runs migrations.
--   app_user        -> the application role for tenant requests.
--                    NOBYPASSRLS: every query is subject to RLS policies.
--   platform_user   -> super-admin / platform-metering role.
--                    BYPASSRLS: can read across all tenants.
--
-- The API connects as app_user for tenant-scoped work and as platform_user only
-- for the explicitly cross-tenant platform module.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_pw' NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_user') THEN
    CREATE ROLE platform_user LOGIN PASSWORD 'platform_user_pw' BYPASSRLS;
  END IF;
END
$$;

-- Schema usage.
GRANT USAGE ON SCHEMA public TO app_user, platform_user;

-- Tables/sequences are created later by migrations (as `postgres`).
-- These default privileges ensure app_user / platform_user automatically receive
-- DML rights on every future object created by `postgres` in `public`.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_user;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, platform_user;
