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
import { users } from "./users";
import { invoices } from "./invoices";
import { extraCharges } from "./extra-charges";

/**
 * One application of an `extra_charges` definition onto a specific invoice — the
 * line-item / breakdown source. `label` + `amount_paise` are SNAPSHOTS taken at
 * apply time, so a later edit/remove of the definition never rewrites history,
 * and the invoice's folded `amount_paise` always reconciles against the sum of
 * its `invoice_charges`.
 *
 * `unique(charge_id, period)` makes monthly re-application idempotent: a recurring
 * charge can land on a given month at most once even if `generateMonthly` re-runs.
 * Composite FKs keep invoice + charge + resident in-tenant.
 */
export const invoiceCharges = pgTable(
  "invoice_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    chargeId: uuid("charge_id").notNull(),
    residentId: uuid("resident_id").notNull(),
    label: text("label").notNull(), // snapshot
    amountPaise: integer("amount_paise").notNull(), // snapshot
    period: text("period").notNull(), // 'YYYY-MM'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invoiceFk: foreignKey({
      columns: [t.invoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "invoice_charges_invoice_id_tenant_id_fk",
    }).onDelete("cascade"),
    chargeFk: foreignKey({
      columns: [t.chargeId, t.tenantId],
      foreignColumns: [extraCharges.id, extraCharges.tenantId],
      name: "invoice_charges_charge_id_tenant_id_fk",
    }).onDelete("cascade"),
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "invoice_charges_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    chargePeriod: unique("invoice_charges_charge_id_period_unique").on(
      t.chargeId,
      t.period,
    ),
  }),
);

export type InvoiceCharge = typeof invoiceCharges.$inferSelect;
export type NewInvoiceCharge = typeof invoiceCharges.$inferInsert;
