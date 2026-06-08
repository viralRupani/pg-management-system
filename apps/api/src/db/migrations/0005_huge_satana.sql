CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"photo_key" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assigned_to_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "complaint_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"complaint_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_date" date NOT NULL,
	"meal_type" text NOT NULL,
	"items" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_tenant_date_meal_unique" UNIQUE("tenant_id","menu_date","meal_type")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" text NOT NULL,
	"period" text NOT NULL,
	"limit_paise" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_tenant_category_period_unique" UNIQUE("tenant_id","category","period")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"note" text,
	"spent_on" date NOT NULL,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_user_id_tenant_id_fk" FOREIGN KEY ("assigned_to_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_updates" ADD CONSTRAINT "complaint_updates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_updates" ADD CONSTRAINT "complaint_updates_complaint_id_tenant_id_fk" FOREIGN KEY ("complaint_id","tenant_id") REFERENCES "public"."complaints"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_updates" ADD CONSTRAINT "complaint_updates_author_user_id_tenant_id_fk" FOREIGN KEY ("author_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_tenant_id_fk" FOREIGN KEY ("created_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_tenant_id_fk" FOREIGN KEY ("recorded_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;