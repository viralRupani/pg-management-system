import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Cross-tenant PG-owner identity. Deliberately has NO RLS (like `tenants` /
 * `auth_identities`): an owner spans multiple PGs and is resolved at login,
 * before any tenant context exists. Profile only — the login credential lives in
 * `auth_identities` (role PG_OWNER, tenant_id NULL, user_id = this row's id).
 * The ownership-to-PG mapping lives in `owner_tenants`.
 */
export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("owners_email_unique").on(t.email)],
);

export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
