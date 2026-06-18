CREATE TABLE "extra_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"frequency" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"applied_to_invoice_id" uuid,
	"applied_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extra_charges_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"period" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_charges_charge_id_period_unique" UNIQUE("charge_id","period")
);
--> statement-breakpoint
ALTER TABLE "extra_charges" ADD CONSTRAINT "extra_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_charges" ADD CONSTRAINT "extra_charges_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_charges" ADD CONSTRAINT "extra_charges_created_by_user_id_tenant_id_fk" FOREIGN KEY ("created_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_charges" ADD CONSTRAINT "extra_charges_applied_to_invoice_id_tenant_id_fk" FOREIGN KEY ("applied_to_invoice_id","tenant_id") REFERENCES "public"."invoices"("id","tenant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_charges" ADD CONSTRAINT "invoice_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_charges" ADD CONSTRAINT "invoice_charges_invoice_id_tenant_id_fk" FOREIGN KEY ("invoice_id","tenant_id") REFERENCES "public"."invoices"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_charges" ADD CONSTRAINT "invoice_charges_charge_id_tenant_id_fk" FOREIGN KEY ("charge_id","tenant_id") REFERENCES "public"."extra_charges"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_charges" ADD CONSTRAINT "invoice_charges_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;