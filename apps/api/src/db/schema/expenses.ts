import {
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * A PG expense entry (manager-only). Categorized by free text that lines up with
 * `budgets.category` for the spend-vs-budget summary. Money is integer paise.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    note: text("note"),
    spentOn: date("spent_on").notNull(),
    recordedByUserId: uuid("recorded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    recorderFk: foreignKey({
      columns: [t.recordedByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "expenses_recorded_by_user_id_tenant_id_fk",
    }),
  }),
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
