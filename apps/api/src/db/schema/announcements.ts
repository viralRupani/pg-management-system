import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * A manager broadcast. `audienceType` decides who sees it: ALL is tenant-SHARED
 * (every resident, the default), while SPECIFIC/SEGMENT resolve to an explicit
 * set in `announcement_recipients` at post time. `audienceLabel` is the
 * denormalized human label for the manager list. Author set from the JWT sub.
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
    audienceType: text("audience_type").notNull().default("ALL"), // ALL | SPECIFIC | SEGMENT
    audienceLabel: text("audience_label"), // e.g. "Everyone", "3 selected residents"
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
    // Needed so announcement_recipients can carry tenant_id in its composite FK.
    idTenant: unique("announcements_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
