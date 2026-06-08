import {
  date,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * A PG's published menu for one date + meal. Tenant-SHARED (not resident-owned):
 * every resident sees the same menu, so RLS tenant-scoping is the whole
 * isolation requirement — reads are NOT filtered by user. `unique(tenant_id,
 * menu_date, meal_type)` makes publishing an upsert.
 */
export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    menuDate: date("menu_date").notNull(),
    mealType: text("meal_type").notNull(), // MealType
    items: text("items").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    perMeal: unique("menu_items_tenant_date_meal_unique").on(
      t.tenantId,
      t.menuDate,
      t.mealType,
    ),
  }),
);

export type MenuItem = typeof menuItems.$inferSelect;
export type NewMenuItem = typeof menuItems.$inferInsert;
