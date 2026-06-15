CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"move_in_date" timestamp with time zone NOT NULL,
	"deposit_id" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "bookings_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_bed_id_tenant_id_fk" FOREIGN KEY ("bed_id","tenant_id") REFERENCES "public"."beds"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_deposit_id_tenant_id_fk" FOREIGN KEY ("deposit_id","tenant_id") REFERENCES "public"."deposits"("id","tenant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_tenant_id_fk" FOREIGN KEY ("created_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_pending_bed_unique" ON "bookings" USING btree ("bed_id") WHERE status = 'PENDING';