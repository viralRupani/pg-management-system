import {
  foreignKey,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { announcements } from "./announcements";

/**
 * Explicit recipients for a targeted announcement (SPECIFIC / SEGMENT). ALL
 * posts write no rows — they stay globally visible. Composite FKs keep both the
 * announcement and the recipient in-tenant (FK checks bypass RLS).
 */
export const announcementRecipients = pgTable(
  "announcement_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id").notNull(),
    recipientUserId: uuid("recipient_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    announcementFk: foreignKey({
      columns: [t.announcementId, t.tenantId],
      foreignColumns: [announcements.id, announcements.tenantId],
      name: "announcement_recipients_announcement_id_tenant_id_fk",
    }).onDelete("cascade"),
    recipientFk: foreignKey({
      columns: [t.recipientUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "announcement_recipients_recipient_user_id_tenant_id_fk",
    }).onDelete("cascade"),
    uniqRecipient: unique(
      "announcement_recipients_announcement_recipient_unique",
    ).on(t.announcementId, t.recipientUserId),
  }),
);

export type AnnouncementRecipient =
  typeof announcementRecipients.$inferSelect;
export type NewAnnouncementRecipient =
  typeof announcementRecipients.$inferInsert;
