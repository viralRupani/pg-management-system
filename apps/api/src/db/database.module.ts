import { Global, Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV, loadEnv, type AppEnv } from "../config/env";
import { schema } from "./schema";

/** Drizzle handle bound to the full schema. */
export type Database = NodePgDatabase<typeof schema>;

/**
 * The transaction handle type as produced by `db.transaction(cb)`. Repositories
 * accept `Database` and pass it the tenant-bound tx, which is API-compatible.
 */
export type DatabaseTx = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export const APP_POOL = Symbol("APP_POOL");
export const PLATFORM_POOL = Symbol("PLATFORM_POOL");
/** app_user (NOBYPASSRLS) — every tenant request runs through this, under RLS. */
export const APP_DB = Symbol("APP_DB");
/** platform_user (BYPASSRLS) — ONLY the platform module may inject this. */
export const PLATFORM_DB = Symbol("PLATFORM_DB");

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): AppEnv => loadEnv(),
    },
    {
      provide: APP_POOL,
      inject: [ENV],
      useFactory: (env: AppEnv) =>
        new Pool({ connectionString: env.DATABASE_URL, max: env.DB_POOL_MAX }),
    },
    {
      provide: PLATFORM_POOL,
      inject: [ENV],
      useFactory: (env: AppEnv) =>
        new Pool({ connectionString: env.PLATFORM_DATABASE_URL, max: 5 }),
    },
    {
      provide: APP_DB,
      inject: [APP_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    {
      provide: PLATFORM_DB,
      inject: [PLATFORM_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [ENV, APP_POOL, PLATFORM_POOL, APP_DB, PLATFORM_DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(
    @Inject(APP_POOL) private readonly appPool: Pool,
    @Inject(PLATFORM_POOL) private readonly platformPool: Pool,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.appPool.end(), this.platformPool.end()]);
  }
}
