import {
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * A monthly spending limit for an expense category (manager-only). `period` is
 * 'YYYY-MM'; `unique(tenant_id, category, period)` makes setting it an upsert.
 * Money is integer paise.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    period: text("period").notNull(), // 'YYYY-MM'
    limitPaise: integer("limit_paise").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    perCategoryPeriod: unique("budgets_tenant_category_period_unique").on(
      t.tenantId,
      t.category,
      t.period,
    ),
  }),
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
