CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_tenant_id_token_unique" UNIQUE("tenant_id","token")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_tenant_id_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_tenant_id_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;