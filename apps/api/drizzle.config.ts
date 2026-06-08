import { defineConfig } from "drizzle-kit";

/**
 * Migrations run as the OWNER/superuser (postgres) so the app role (pg_app)
 * never has DDL rights. RLS policies are applied via a hand-written SQL
 * migration (see src/db/migrations/*-rls.sql) rather than generated, because
 * drizzle-kit does not model RLS policies.
 */
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5433/pg_management",
  },
  verbose: true,
  strict: true,
});
