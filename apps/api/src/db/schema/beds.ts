import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { rooms } from "./rooms";

/**
 * A bed within a room — the unit a resident is allocated to. `status` is a
 * convenience mirror of the allocations table (the source of truth for who is
 * where); it is only ever mutated in the same transaction as an allocation.
 * Composite FK to rooms(id, tenant_id) keeps the parent inside the tenant.
 */
export const beds = pgTable(
  "beds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull(),
    label: text("label").notNull(), // e.g. "A", "Bunk-1"
    status: text("status").notNull().default("VACANT"), // BedStatus
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    roomFk: foreignKey({
      columns: [t.roomId, t.tenantId],
      foreignColumns: [rooms.id, rooms.tenantId],
      name: "beds_room_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("beds_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Bed = typeof beds.$inferSelect;
export type NewBed = typeof beds.$inferInsert;
