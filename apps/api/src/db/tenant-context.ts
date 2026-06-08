import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { APP_DB, type Database, type DatabaseTx } from "./database.module";

/**
 * Per-request tenant context. `tx` is the transaction-bound Drizzle handle on
 * which `SET LOCAL app.current_tenant_id` was issued, so every query made
 * through it is pinned to the same pooled connection as that SET — no leakage.
 */
export interface TenantStore {
  tenantId: string;
  tx: DatabaseTx;
}

const als = new AsyncLocalStorage<TenantStore>();

@Injectable()
export class TenantContextService {
  constructor(@Inject(APP_DB) private readonly appDb: Database) {}

  /**
   * Open a transaction, pin the tenant id to its connection via a
   * transaction-local setting, and run `fn` inside the ALS scope. Repositories
   * called within `fn` read the tenant-bound handle via `db()`.
   */
  async run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.appDb.transaction(async (tx) => {
      // set_config(key, value, is_local=true) == SET LOCAL, parameterized.
      await tx.execute(
        sql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
      );
      return als.run({ tenantId, tx }, fn);
    });
  }

  /** The current tenant-bound Drizzle handle. Throws if outside tenant context. */
  db(): DatabaseTx {
    const store = als.getStore();
    if (!store) {
      throw new Error(
        "No tenant context: a tenant-scoped query ran outside TenantContextService.run()",
      );
    }
    return store.tx;
  }

  /** Current tenant id, or undefined if outside tenant context. */
  currentTenantId(): string | undefined {
    return als.getStore()?.tenantId;
  }
}
