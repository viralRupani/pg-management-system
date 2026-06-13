CREATE TABLE "transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"from_bed_id" uuid NOT NULL,
	"to_bed_id" uuid NOT NULL,
	"planned_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "transfer_requests_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "rent_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"description" text NOT NULL,
	"source" text DEFAULT 'TRANSFER' NOT NULL,
	"applied_to_invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_bed_id_tenant_id_fk" FOREIGN KEY ("from_bed_id","tenant_id") REFERENCES "public"."beds"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_bed_id_tenant_id_fk" FOREIGN KEY ("to_bed_id","tenant_id") REFERENCES "public"."beds"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_adjustments" ADD CONSTRAINT "rent_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_adjustments" ADD CONSTRAINT "rent_adjustments_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rent_adjustments" ADD CONSTRAINT "rent_adjustments_applied_to_invoice_id_tenant_id_fk" FOREIGN KEY ("applied_to_invoice_id","tenant_id") REFERENCES "public"."invoices"("id","tenant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_requests_pending_resident_unique" ON "transfer_requests" USING btree ("resident_id") WHERE status = 'PENDING';