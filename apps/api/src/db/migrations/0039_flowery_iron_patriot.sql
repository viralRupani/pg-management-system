-- Resident login switches from phone/SMS OTP to email OTP. auth_identities
-- gains a per-tenant unique resident email slot (mirrors the existing
-- per-tenant phone uniqueness); the old system-wide email uniqueness now
-- excludes residents (managers/owners/platform admins keep it).

-- 1. Backfill: residents never had auth_identities.email populated before
-- this change — copy it over from users.email so the new unique index has
-- something to enforce against and login can resolve existing residents.
UPDATE "auth_identities" ai
SET "email" = lower(trim(u."email"))
FROM "users" u
WHERE ai."user_id" = u."id"
  AND ai."tenant_id" = u."tenant_id"
  AND ai."role" = 'RESIDENT'
  AND ai."email" IS NULL
  AND u."email" IS NOT NULL;
--> statement-breakpoint

-- 2. Pre-flight: fail loudly (not silently drop rows) if any tenant already
-- has two residents sharing an email — the new unique index would otherwise
-- reject the migration with an opaque constraint-violation error.
DO $$
DECLARE
  dupe_count integer;
BEGIN
  SELECT count(*) INTO dupe_count FROM (
    SELECT "tenant_id", lower("email")
    FROM "auth_identities"
    WHERE "role" = 'RESIDENT' AND "email" IS NOT NULL
    GROUP BY "tenant_id", lower("email")
    HAVING count(*) > 1
  ) dupes;
  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply resident-email uniqueness: % tenant(s) have residents sharing an email. Resolve duplicates in auth_identities/users before re-running this migration.', dupe_count;
  END IF;
END $$;
--> statement-breakpoint

DROP INDEX "auth_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tenant_resident_email_unique" ON "auth_identities" USING btree ("tenant_id","email") WHERE "auth_identities"."email" IS NOT NULL AND "auth_identities"."role" = 'RESIDENT';--> statement-breakpoint
CREATE UNIQUE INDEX "auth_email_unique" ON "auth_identities" USING btree ("email") WHERE "auth_identities"."email" IS NOT NULL AND "auth_identities"."role" <> 'RESIDENT';
