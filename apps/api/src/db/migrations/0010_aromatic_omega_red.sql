CREATE TABLE "announcement_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_recipients_announcement_recipient_unique" UNIQUE("announcement_id","recipient_user_id")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "audience_type" text DEFAULT 'ALL' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "audience_label" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_tenant_id_fk" FOREIGN KEY ("announcement_id","tenant_id") REFERENCES "public"."announcements"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_recipient_user_id_tenant_id_fk" FOREIGN KEY ("recipient_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
