ALTER TABLE "payments" ALTER COLUMN "screenshot_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference_id" text;