ALTER TABLE "users" ADD COLUMN "exit_pending_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exit_pending_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exit_pending_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exit_pending_at" timestamp with time zone;