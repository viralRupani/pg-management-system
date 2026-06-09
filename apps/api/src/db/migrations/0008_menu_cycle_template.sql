DROP TABLE "menu_items";
--> statement-breakpoint
CREATE TABLE "menu_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"cycle_length_weeks" integer DEFAULT 1 NOT NULL,
	"cycle_start_date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"meal_type" text NOT NULL,
	"items" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_slots_tenant_week_dow_meal_unique" UNIQUE("tenant_id","week_number","day_of_week","meal_type")
);
--> statement-breakpoint
ALTER TABLE "menu_config" ADD CONSTRAINT "menu_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "menu_slots" ADD CONSTRAINT "menu_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
