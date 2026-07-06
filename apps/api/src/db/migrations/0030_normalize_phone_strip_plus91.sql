-- Whole-country (India) app: phones are stored as the bare 10 digits, no
-- country code. The `indianPhone` Zod schema now strips a leading `+91` on
-- every write, and resident OTP login sends the bare number. Backfill existing
-- rows that were stored with the `+91` prefix so the stored value and the login
-- lookup share one canonical shape (otherwise those residents can never receive
-- an OTP). Verified beforehand that stripping introduces no per-tenant unique
-- collision in auth_identities / users.
UPDATE "auth_identities" SET "phone" = regexp_replace("phone", '^\+91', '') WHERE "phone" LIKE '+91%';
--> statement-breakpoint
UPDATE "users" SET "phone" = regexp_replace("phone", '^\+91', '') WHERE "phone" LIKE '+91%';
--> statement-breakpoint
UPDATE "users" SET "emergency_contact_phone" = regexp_replace("emergency_contact_phone", '^\+91', '') WHERE "emergency_contact_phone" LIKE '+91%';
