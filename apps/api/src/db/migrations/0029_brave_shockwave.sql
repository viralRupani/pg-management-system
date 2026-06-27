CREATE TABLE "invoice_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"day_of_month" integer NOT NULL,
	"hour" integer NOT NULL,
	"minute" integer NOT NULL,
	"last_run_period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_schedules_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "invoice_schedules" ADD CONSTRAINT "invoice_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;