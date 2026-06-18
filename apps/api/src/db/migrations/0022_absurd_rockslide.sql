ALTER TABLE "invoices" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deleted_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "deleted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deleted_by_user_id_tenant_id_fk" FOREIGN KEY ("deleted_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;