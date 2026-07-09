CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_id" uuid NOT NULL,
	"discount_paise" integer NOT NULL,
	"qualified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_to_invoice_id" uuid,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referred_id_tenant_id_unique" UNIQUE("referred_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "referral_discount_paise" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_tenant_id_fk" FOREIGN KEY ("referrer_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_tenant_id_fk" FOREIGN KEY ("referred_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_applied_to_invoice_id_tenant_id_fk" FOREIGN KEY ("applied_to_invoice_id","tenant_id") REFERENCES "public"."invoices"("id","tenant_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_tenant_id_fk" FOREIGN KEY ("referred_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;