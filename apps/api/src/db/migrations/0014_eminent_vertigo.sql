ALTER TABLE "users" ADD COLUMN "exit_requested_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exit_request_note" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exit_requested_at" timestamp with time zone;