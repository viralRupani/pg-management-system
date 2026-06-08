import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * A manager broadcast to the whole PG. Tenant-SHARED: every resident sees every
 * announcement, so reads are NOT user-filtered — RLS tenant-scoping is the whole
 * isolation requirement. Author set from the JWT sub.
 */
export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    authorFk: foreignKey({
      columns: [t.createdByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "announcements_created_by_user_id_tenant_id_fk",
    }),
  }),
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
