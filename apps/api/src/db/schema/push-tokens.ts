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
 * A resident device's Expo push token. The NotificationsService fans a push out
 * to all of a user's tokens. `unique(tenant_id, token)` keeps re-registration of
 * the same device idempotent (upsert on conflict).
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform"), // 'ios' | 'android'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userFk: foreignKey({
      columns: [t.userId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "push_tokens_user_id_tenant_id_fk",
    }).onDelete("cascade"),
    tenantToken: unique("push_tokens_tenant_id_token_unique").on(
      t.tenantId,
      t.token,
    ),
  }),
);

export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
