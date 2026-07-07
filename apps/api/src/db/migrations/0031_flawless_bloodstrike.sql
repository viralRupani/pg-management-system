CREATE TABLE "tc_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"published_by_email" text,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tc_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "tc_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_identity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tc_acceptances_identity_version_unique" UNIQUE("auth_identity_id","version")
);
--> statement-breakpoint
ALTER TABLE "tc_acceptances" ADD CONSTRAINT "tc_acceptances_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE cascade ON UPDATE no action;