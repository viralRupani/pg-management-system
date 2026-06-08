CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "invoices_resident_id_period_unique" UNIQUE("resident_id","period")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"screenshot_key" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"reviewed_by_user_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_tenant_id_fk" FOREIGN KEY ("invoice_id","tenant_id") REFERENCES "public"."invoices"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_user_id_tenant_id_fk" FOREIGN KEY ("reviewed_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;