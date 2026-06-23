CREATE TABLE "short_stays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"fee_paise" integer DEFAULT 0 NOT NULL,
	"check_in_date" text NOT NULL,
	"check_out_date" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "short_stays_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "short_stays" ADD CONSTRAINT "short_stays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_stays" ADD CONSTRAINT "short_stays_bed_id_tenant_id_fk" FOREIGN KEY ("bed_id","tenant_id") REFERENCES "public"."beds"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_stays" ADD CONSTRAINT "short_stays_booking_id_tenant_id_fk" FOREIGN KEY ("booking_id","tenant_id") REFERENCES "public"."bookings"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_stays" ADD CONSTRAINT "short_stays_created_by_user_id_tenant_id_fk" FOREIGN KEY ("created_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "short_stays_active_bed_unique" ON "short_stays" USING btree ("bed_id") WHERE status = 'ACTIVE';