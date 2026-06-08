import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { beds } from "./beds";
import { users } from "./users";

/**
 * Bed <-> resident allocation with history. `endDate IS NULL` means the
 * allocation is currently active. This table — not beds.status — is the source
 * of truth for who occupies what.
 *
 * Two partial-unique indexes enforce the core invariants at the DB level, safe
 * under concurrency and independent of beds.status:
 *   - at most one ACTIVE allocation per bed   (no double-booking)
 *   - at most one ACTIVE allocation per resident (one bed per resident)
 *
 * Composite FKs to beds(id, tenant_id) and users(id, tenant_id) keep both the
 * bed and the resident inside the same tenant (FK checks bypass RLS).
 */
export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bedId: uuid("bed_id").notNull(),
    residentId: uuid("resident_id").notNull(),
    startDate: timestamp("start_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bedFk: foreignKey({
      columns: [t.bedId, t.tenantId],
      foreignColumns: [beds.id, beds.tenantId],
      name: "allocations_bed_id_tenant_id_fk",
    }).onDelete("cascade"),
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "allocations_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("allocations_id_tenant_id_unique").on(t.id, t.tenantId),
    activeBed: uniqueIndex("allocations_active_bed_unique")
      .on(t.bedId)
      .where(sql`end_date is null`),
    activeResident: uniqueIndex("allocations_active_resident_unique")
      .on(t.residentId)
      .where(sql`end_date is null`),
  }),
);

export type Allocation = typeof allocations.$inferSelect;
export type NewAllocation = typeof allocations.$inferInsert;
