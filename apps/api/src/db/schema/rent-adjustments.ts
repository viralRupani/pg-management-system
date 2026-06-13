import {
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { invoices } from "./invoices";

/**
 * A pending, SIGNED rent correction for a resident, queued out-of-band and
 * consumed by the next generated invoice. `amount_paise` may be NEGATIVE (a
 * credit owed to the resident, e.g. they moved to a cheaper room mid-month) or
 * positive (an extra charge). Created by a mid-month room transfer: the
 * transfer-month invoice (already billed full old-room on the 1st, possibly
 * PAID) is left untouched and the delta is settled here instead.
 *
 * `applied_to_invoice_id IS NULL` = not yet consumed. `generateMonthly` folds
 * unapplied rows into the resident's new invoice exactly once, stamping
 * `applied_to_invoice_id` + `applied_at`. Composite FKs keep resident + invoice
 * in-tenant.
 */
export const rentAdjustments = pgTable(
  "rent_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    amountPaise: integer("amount_paise").notNull(), // SIGNED — may be negative
    description: text("description").notNull(),
    source: text("source").notNull().default("TRANSFER"),
    appliedToInvoiceId: uuid("applied_to_invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "rent_adjustments_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    invoiceFk: foreignKey({
      columns: [t.appliedToInvoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "rent_adjustments_applied_to_invoice_id_tenant_id_fk",
    }).onDelete("set null"),
  }),
);

export type RentAdjustment = typeof rentAdjustments.$inferSelect;
export type NewRentAdjustment = typeof rentAdjustments.$inferInsert;
