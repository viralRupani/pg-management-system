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
import { deposits } from "./deposits";
import { users } from "./users";

/**
 * A future-dated bed booking (advance reservation). A manager holds a bed for an
 * incoming resident before their move-in date and records the deposit up front.
 * The bed is held — shown as occupied (status RESERVED if it was vacant, or left
 * OCCUPIED if the sitting resident hasn't left yet) — but NO `allocations` row is
 * created and no rent is billed until activation. The booking is PENDING until a
 * daily job activates it on/after `move_in_date` (-> ACTIVATED, creating the real
 * allocation) or the manager drops it (-> CANCELLED).
 *
 * The partial-unique index allows at most one PENDING booking per bed — the hard
 * backstop against double-booking. Composite FKs to beds/users/deposits all carry
 * tenant_id to keep every reference in-tenant.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    bedId: uuid("bed_id").notNull(),
    moveInDate: timestamp("move_in_date", { withTimezone: true }).notNull(),
    depositId: uuid("deposit_id"),
    status: text("status").notNull().default("PENDING"), // BookingStatus
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "bookings_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    bedFk: foreignKey({
      columns: [t.bedId, t.tenantId],
      foreignColumns: [beds.id, beds.tenantId],
      name: "bookings_bed_id_tenant_id_fk",
    }).onDelete("cascade"),
    depositFk: foreignKey({
      columns: [t.depositId, t.tenantId],
      foreignColumns: [deposits.id, deposits.tenantId],
      name: "bookings_deposit_id_tenant_id_fk",
    }).onDelete("set null"),
    createdByFk: foreignKey({
      columns: [t.createdByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "bookings_created_by_user_id_tenant_id_fk",
    }),
    idTenant: unique("bookings_id_tenant_id_unique").on(t.id, t.tenantId),
    pendingBed: uniqueIndex("bookings_pending_bed_unique")
      .on(t.bedId)
      .where(sql`status = 'PENDING'`),
  }),
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
