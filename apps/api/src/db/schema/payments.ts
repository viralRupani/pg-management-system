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
 * A resident's payment attempt against an invoice: a screenshot (S3 key) the
 * manager reviews. Lifecycle is SUBMITTED -> APPROVED | REJECTED (guarded in the
 * service). `residentId` is denormalized for ownership checks — RLS isolates
 * tenants, NOT residents within a tenant, so every resident query must filter by
 * resident_id = the caller's sub. Composite FKs keep invoice/resident/reviewer
 * in tenant; the nullable reviewer FK is unenforced until set (MATCH SIMPLE).
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    residentId: uuid("resident_id").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    screenshotKey: text("screenshot_key").notNull(),
    status: text("status").notNull().default("SUBMITTED"), // PaymentStatus
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    invoiceFk: foreignKey({
      columns: [t.invoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "payments_invoice_id_tenant_id_fk",
    }).onDelete("cascade"),
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "payments_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    reviewerFk: foreignKey({
      columns: [t.reviewedByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "payments_reviewed_by_user_id_tenant_id_fk",
    }),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
