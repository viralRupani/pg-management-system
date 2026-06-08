import {
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { buildings } from "./buildings";

/**
 * A floor within a building. The (building_id, tenant_id) composite FK to
 * buildings(id, tenant_id) makes a cross-tenant parent reference impossible at
 * the schema level (FK checks bypass RLS). The direct tenant_id FK is kept for
 * an independent guarantee that tenant_id is always a real tenant.
 */
export const floors = pgTable(
  "floors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    buildingId: uuid("building_id").notNull(),
    label: text("label").notNull(), // e.g. "Ground", "1st"
    floorNumber: integer("floor_number").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    buildingFk: foreignKey({
      columns: [t.buildingId, t.tenantId],
      foreignColumns: [buildings.id, buildings.tenantId],
      name: "floors_building_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("floors_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Floor = typeof floors.$inferSelect;
export type NewFloor = typeof floors.$inferInsert;
