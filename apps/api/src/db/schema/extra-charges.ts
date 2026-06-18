import {
  boolean,
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

/**
 * A manager/owner-defined extra charge on a resident, beyond base rent — e.g. a
 * one-off repair fee or a recurring monthly laundry charge. `label` is free text.
 * `amount_paise` is positive (integer paise). Distinct from `rent_adjustments`
 * (internal, signed transfer/carry-forward corrections) because this is
 * human-authored and labelled.
 *
 * `frequency`:
 *   ONE_TIME — folded into exactly ONE invoice. `applied_to_invoice_id` +
 *     `applied_at` are the once-only marker (mirrors rent_adjustments); a pending
 *     one-time has `applied_at IS NULL`.
 *   MONTHLY — re-applied every monthly generation while `active`. "Remove" is a
 *     soft-deactivate (`active=false`) so already-billed invoice_charges survive
 *     and the folded invoice totals keep reconciling.
 *
 * Each application is recorded as an `invoice_charges` row (the breakdown source).
 * Composite FKs keep resident + invoice + creator in-tenant.
 */
export const extraCharges = pgTable(
  "extra_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    label: text("label").notNull(),
    amountPaise: integer("amount_paise").notNull(), // positive
    frequency: text("frequency").notNull(), // ChargeFrequency
    active: boolean("active").notNull().default(true),
    appliedToInvoiceId: uuid("applied_to_invoice_id"), // ONE_TIME once-marker
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "extra_charges_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    creatorFk: foreignKey({
      columns: [t.createdByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "extra_charges_created_by_user_id_tenant_id_fk",
    }),
    invoiceFk: foreignKey({
      columns: [t.appliedToInvoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "extra_charges_applied_to_invoice_id_tenant_id_fk",
    }).onDelete("set null"),
    idTenant: unique("extra_charges_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type ExtraCharge = typeof extraCharges.$inferSelect;
export type NewExtraCharge = typeof extraCharges.$inferInsert;
