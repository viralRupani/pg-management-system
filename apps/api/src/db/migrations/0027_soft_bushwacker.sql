ALTER TABLE "users" DROP CONSTRAINT "users_resident_age_required";--> statement-breakpoint
ALTER TABLE "short_stays" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expected_move_in_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_short_stay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "short_stay_check_out_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "short_stay_per_day_charge_paise" integer;--> statement-breakpoint
ALTER TABLE "short_stays" ADD COLUMN "resident_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "short_stays" ADD COLUMN "per_day_charge_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "short_stays" ADD CONSTRAINT "short_stays_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_resident_age_required" CHECK ("users"."role" <> 'RESIDENT' OR "users"."age" IS NOT NULL OR "users"."is_short_stay");