import { sql } from "drizzle-orm";
import {
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { beds } from "./beds";
import { bookings } from "./bookings";
import { users } from "./users";

/**
 * A short-term (transient) guest stay on a RESERVED bed. Lets managers utilise
 * a bed that is held for a future booking but not yet occupied. The stay must
 * end strictly before the pending booking's move-in date so the booking can
 * activate on schedule. The bed is set to TRANSIENT while the stay is ACTIVE
 * and returns to RESERVED on completion/cancellation via freeBed().
 *
 * The guest is a lightweight resident row (`users.isShortStay`); this row holds
 * the bed occupancy + upfront per-day terms. A stay can sit on a plain VACANT
 * bed (bookingId null) or on a bed RESERVED for a future booking (bookingId set,
 * checkOut strictly < booking.moveInDate). Billing is a simple upfront total —
 * never invoiced, never metered.
 */
export const shortStays = pgTable(
  "short_stays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bedId: uuid("bed_id").notNull(),
    // The guest resident this stay belongs to.
    residentId: uuid("resident_id").notNull(),
    // The future booking holding the bed, when the guest occupies a RESERVED
    // bed in the interim; null when the bed was simply VACANT.
    bookingId: uuid("booking_id"),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone"),
    perDayChargePaise: integer("per_day_charge_paise").notNull().default(0),
    feePaise: integer("fee_paise").notNull().default(0), // total = days × per-day
    checkInDate: text("check_in_date").notNull(), // YYYY-MM-DD (IST)
    checkOutDate: text("check_out_date").notNull(), // YYYY-MM-DD (IST), strictly < booking.moveInDate
    status: text("status").notNull().default("ACTIVE"), // ShortStayStatus
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    bedFk: foreignKey({
      columns: [t.bedId, t.tenantId],
      foreignColumns: [beds.id, beds.tenantId],
      name: "short_stays_bed_id_tenant_id_fk",
    }).onDelete("cascade"),
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "short_stays_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    bookingFk: foreignKey({
      columns: [t.bookingId, t.tenantId],
      foreignColumns: [bookings.id, bookings.tenantId],
      name: "short_stays_booking_id_tenant_id_fk",
    }).onDelete("cascade"),
    createdByFk: foreignKey({
      columns: [t.createdByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "short_stays_created_by_user_id_tenant_id_fk",
    }),
    idTenant: unique("short_stays_id_tenant_id_unique").on(t.id, t.tenantId),
    activeBed: uniqueIndex("short_stays_active_bed_unique")
      .on(t.bedId)
      .where(sql`status = 'ACTIVE'`),
  }),
);

export type ShortStay = typeof shortStays.$inferSelect;
export type NewShortStay = typeof shortStays.$inferInsert;
