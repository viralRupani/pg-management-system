CREATE TABLE "billing_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period" text NOT NULL,
	"active_residents" integer NOT NULL,
	"rate_paise" integer NOT NULL,
	"amount_due_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_snapshots_tenant_period_unique" UNIQUE("tenant_id","period")
);
--> statement-breakpoint
ALTER TABLE "billing_snapshots" ADD CONSTRAINT "billing_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;