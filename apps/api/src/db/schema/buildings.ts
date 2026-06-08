import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Top level of the property hierarchy: buildings -> floors -> rooms -> beds.
 * Tenant-scoped (RLS). The `unique(id, tenant_id)` is the composite-FK target
 * that lets floors reference (building_id, tenant_id) so a floor can never point
 * at another tenant's building (FK checks bypass RLS, so tenant scoping has to
 * live inside the FK itself).
 */
export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idTenant: unique("buildings_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
