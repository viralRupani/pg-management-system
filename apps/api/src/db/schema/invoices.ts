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
import { users } from "./users";

/**
 * A monthly rent invoice for one resident. `period` is the billing month as
 * 'YYYY-MM' text (project-wide convention). A partial unique index on
 * `(resident_id, period) WHERE deleted_at IS NULL` enforces at most one live
 * invoice per resident per month while allowing re-generation after a void.
 * Amount is integer paise. Composite FK to users(id, tenant_id) keeps the
 * resident in tenant; `unique(id, tenant_id)` is the composite-FK target for
 * payments.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    period: text("period").notNull(), // 'YYYY-MM'
    amountPaise: integer("amount_paise").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("PENDING"), // InvoiceStatus
    // Manager soft-delete (void). null = live; when set the invoice is cancelled:
    // unpayable, skipped by overdue-marking, and dropped from billed/paid totals,
    // but it stays in the list with the reason shown. status is left untouched.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedReason: text("deleted_reason"),
    deletedByUserId: uuid("deleted_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "invoices_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    deletedByFk: foreignKey({
      columns: [t.deletedByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "invoices_deleted_by_user_id_tenant_id_fk",
    }),
    idTenant: unique("invoices_id_tenant_id_unique").on(t.id, t.tenantId),
    // Partial: only one LIVE invoice per resident per period. Soft-deleted
    // (voided) invoices are excluded so a manager can re-generate after voiding.
    residentPeriodActive: uniqueIndex("invoices_resident_id_period_active_unique")
      .on(t.residentId, t.period)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
