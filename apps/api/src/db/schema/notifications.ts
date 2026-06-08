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
 * Per-user notification feed row. Written by NotificationsService alongside a
 * push dispatch. `userId` composite-FK keeps the recipient in tenant; RLS
 * isolates tenants, and resident queries additionally filter user_id = sub
 * (RLS does not isolate users within a tenant).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(), // e.g. RENT_REMINDER, PAYMENT_APPROVED
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userFk: foreignKey({
      columns: [t.userId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "notifications_user_id_tenant_id_fk",
    }).onDelete("cascade"),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
