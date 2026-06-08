import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { owners } from "./owners";
import { tenants } from "./tenants";

/**
 * Maps a PG owner to each PG they own, plus the per-tenant PG_OWNER `users` row
 * that is the owner's in-PG actor (so manager-style actor FKs resolve). NO RLS:
 * this is the ownership map, read before any tenant context (e.g. to mint a
 * tenant-scoped token in the PG switch). Every owner operation on a tenant is
 * gated by the existence of a row here for (ownerId, tenantId).
 */
export const ownerTenants = pgTable(
  "owner_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // The PG_OWNER `users` row in this tenant — what `sub` becomes in the scoped
    // token so actor FKs (reviewedBy, recordedBy, …) resolve to a real user.
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("owner_tenants_owner_id_tenant_id_unique").on(t.ownerId, t.tenantId)],
);

export type OwnerTenant = typeof ownerTenants.$inferSelect;
export type NewOwnerTenant = typeof ownerTenants.$inferInsert;
