ALTER TABLE "users" ADD COLUMN "emergency_contact_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_relation" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_resident_age_required" CHECK ("users"."role" <> 'RESIDENT' OR "users"."age" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_emergency_all_or_none" CHECK (("users"."emergency_contact_name" IS NULL AND "users"."emergency_contact_relation" IS NULL AND "users"."emergency_contact_phone" IS NULL)
        OR ("users"."emergency_contact_name" IS NOT NULL AND "users"."emergency_contact_relation" IS NOT NULL AND "users"."emergency_contact_phone" IS NOT NULL));