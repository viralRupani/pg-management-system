import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { beds } from "./beds";
import { users } from "./users";

/**
 * A pre-booked room move (soft hold). A manager records the intent to move a
 * resident from their current bed to a target bed by a planned date; the target
 * bed is NOT locked (vacancy is re-checked when the move executes). PENDING until
 * the manager executes the move on the actual day (-> COMPLETED) or drops it
 * (-> CANCELLED).
 *
 * The partial-unique index allows at most one PENDING request per resident, so a
 * resident can't accumulate conflicting open moves. Composite FKs to
 * beds(id, tenant_id) and users(id, tenant_id) keep everything in-tenant.
 */
export const transferRequests = pgTable(
  "transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    fromBedId: uuid("from_bed_id").notNull(),
    toBedId: uuid("to_bed_id").notNull(),
    plannedDate: timestamp("planned_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("PENDING"), // TransferRequestStatus
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "transfer_requests_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    fromBedFk: foreignKey({
      columns: [t.fromBedId, t.tenantId],
      foreignColumns: [beds.id, beds.tenantId],
      name: "transfer_requests_from_bed_id_tenant_id_fk",
    }).onDelete("cascade"),
    toBedFk: foreignKey({
      columns: [t.toBedId, t.tenantId],
      foreignColumns: [beds.id, beds.tenantId],
      name: "transfer_requests_to_bed_id_tenant_id_fk",
    }).onDelete("cascade"),
    idTenant: unique("transfer_requests_id_tenant_id_unique").on(
      t.id,
      t.tenantId,
    ),
    pendingResident: uniqueIndex("transfer_requests_pending_resident_unique")
      .on(t.residentId)
      .where(sql`status = 'PENDING'`),
  }),
);

export type TransferRequest = typeof transferRequests.$inferSelect;
export type NewTransferRequest = typeof transferRequests.$inferInsert;
