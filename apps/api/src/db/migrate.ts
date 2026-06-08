import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { join } from "node:path";
import { RLS_TABLES } from "./schema";

/**
 * Migration runner. Runs as the OWNER (postgres) so the app role never has DDL
 * rights. Steps:
 *   1. Apply Drizzle-generated table migrations.
 *   2. Enable + FORCE RLS and (re)create the tenant-isolation policy on every
 *      RLS table, with BOTH USING (reads) and WITH CHECK (writes).
 *   3. (Re)grant DML to app_user / platform_user as a belt-and-suspenders backstop
 *      to the default privileges set at container init.
 *
 * The policy reads the transaction-local setting; when it is unset,
 * current_setting(..., true) returns NULL -> nullif -> NULL -> no rows match
 * (fail-closed default deny).
 */
async function main(): Promise<void> {
  const url =
    process.env.MIGRATION_DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5433/pg_management";

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  try {
    console.log("[migrate] applying table migrations...");
    await migrate(db, { migrationsFolder: join(__dirname, "migrations") });

    console.log("[migrate] applying RLS policies...");
    for (const table of RLS_TABLES) {
      const ident = sql.identifier(table);
      await db.execute(sql`alter table ${ident} enable row level security;`);
      await db.execute(sql`alter table ${ident} force row level security;`);
      await db.execute(
        sql`drop policy if exists tenant_isolation on ${ident};`,
      );
      await db.execute(sql`
        create policy tenant_isolation on ${ident}
          using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
          with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
      `);
      console.log(`[migrate]   RLS enabled on ${table}`);
    }

    console.log("[migrate] granting DML to app + platform roles...");
    await db.execute(
      sql`grant select, insert, update, delete on all tables in schema public to app_user, platform_user;`,
    );
    await db.execute(
      sql`grant usage, select on all sequences in schema public to app_user, platform_user;`,
    );

    console.log("[migrate] done.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
