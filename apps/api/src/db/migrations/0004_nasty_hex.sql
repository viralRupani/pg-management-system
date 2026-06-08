CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"type" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"review_note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text DEFAULT 'HELD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_id_tenant_id_unique" UNIQUE("id","tenant_id"),
	CONSTRAINT "deposits_resident_id_unique" UNIQUE("resident_id")
);
--> statement-breakpoint
CREATE TABLE "deposit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deposit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"amount_paise" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_user_id_tenant_id_fk" FOREIGN KEY ("reviewed_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_deposit_id_tenant_id_fk" FOREIGN KEY ("deposit_id","tenant_id") REFERENCES "public"."deposits"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_created_by_user_id_tenant_id_fk" FOREIGN KEY ("created_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;