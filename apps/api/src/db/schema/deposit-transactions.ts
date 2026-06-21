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
import { deposits } from "./deposits";
import { invoices } from "./invoices";

/**
 * The exit-settlement ledger for a deposit. On exit the manager records DEDUCTION
 * line-items (damages, dues) and the system writes a REFUND line; the invariant
 * `held = Σdeductions + refund` holds (over-deduction is rejected in the
 * service). Append-only history. Composite FKs keep deposit + author in tenant.
 *
 * A DEDUCTION may carry `invoiceId` when it settles a rent invoice from the
 * deposit ("use my deposit for this month's rent"): the matching invoice flips to
 * PAID in the same transaction. Damage deductions and the REFUND row leave it null.
 */
export const depositTransactions = pgTable(
  "deposit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    depositId: uuid("deposit_id").notNull(),
    type: text("type").notNull(), // DepositTxnType (DEDUCTION | REFUND)
    reason: text("reason"),
    amountPaise: integer("amount_paise").notNull(),
    // Set when this deduction settled a rent invoice from the deposit.
    invoiceId: uuid("invoice_id"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    depositFk: foreignKey({
      columns: [t.depositId, t.tenantId],
      foreignColumns: [deposits.id, deposits.tenantId],
      name: "deposit_transactions_deposit_id_tenant_id_fk",
    }).onDelete("cascade"),
    invoiceFk: foreignKey({
      columns: [t.invoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "deposit_transactions_invoice_id_tenant_id_fk",
    }),
    authorFk: foreignKey({
      columns: [t.createdByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "deposit_transactions_created_by_user_id_tenant_id_fk",
    }),
  }),
);

export type DepositTransaction = typeof depositTransactions.$inferSelect;
export type NewDepositTransaction = typeof depositTransactions.$inferInsert;
