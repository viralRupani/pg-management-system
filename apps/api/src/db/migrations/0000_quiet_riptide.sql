CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"accent_color" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"role" text NOT NULL,
	"user_id" uuid,
	"email" text,
	"phone" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"age" integer,
	"occupation_type" text,
	"native_place" text,
	"emergency_contact" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"join_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_email_unique" ON "auth_identities" USING btree ("email") WHERE "auth_identities"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tenant_phone_unique" ON "auth_identities" USING btree ("tenant_id","phone") WHERE "auth_identities"."phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_tenant_idx" ON "auth_identities" USING btree ("tenant_id");