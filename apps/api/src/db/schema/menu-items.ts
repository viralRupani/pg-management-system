import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One row per tenant: the cycle anchor. `tenant_id` IS the PK — this is a
 * tenant-root-level singleton (like a settings row), not a child table.
 * Direct FK to tenants.id (no composite pattern needed — there is no
 * tenant-scoped parent to carry).
 */
export const menuConfig = pgTable("menu_config", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  cycleLengthWeeks: integer("cycle_length_weeks").notNull().default(1),
  cycleStartDate: date("cycle_start_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MenuConfigRow = typeof menuConfig.$inferSelect;
export type NewMenuConfig = typeof menuConfig.$inferInsert;

/**
 * Abstract template slots. `week_number` (1–3), `day_of_week` (1=Mon…7=Sun,
 * ISO), `meal_type` — together with `tenant_id` they form the natural unique
 * key. Direct FK to tenants.id (same pattern as budgets/expenses).
 */
export const menuSlots = pgTable(
  "menu_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    mealType: text("meal_type").notNull(),
    items: text("items").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    perSlot: unique("menu_slots_tenant_week_dow_meal_unique").on(
      t.tenantId,
      t.weekNumber,
      t.dayOfWeek,
      t.mealType,
    ),
  }),
);

export type MenuSlotRow = typeof menuSlots.$inferSelect;
export type NewMenuSlot = typeof menuSlots.$inferInsert;
