CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buildings_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"label" text NOT NULL,
	"floor_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floors_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"label" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"sharing_type" text,
	"monthly_rent_paise" integer DEFAULT 0 NOT NULL,
	"occupation_preference" text,
	"gender_preference" text,
	"age_min" integer,
	"age_max" integer,
	"native_place_preference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "beds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'VACANT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beds_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_tenant_id_fk" FOREIGN KEY ("building_id","tenant_id") REFERENCES "public"."buildings"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_tenant_id_fk" FOREIGN KEY ("floor_id","tenant_id") REFERENCES "public"."floors"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_tenant_id_fk" FOREIGN KEY ("room_id","tenant_id") REFERENCES "public"."rooms"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_bed_id_tenant_id_fk" FOREIGN KEY ("bed_id","tenant_id") REFERENCES "public"."beds"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_resident_id_tenant_id_fk" FOREIGN KEY ("resident_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_active_bed_unique" ON "allocations" USING btree ("bed_id") WHERE end_date is null;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_active_resident_unique" ON "allocations" USING btree ("resident_id") WHERE end_date is null;