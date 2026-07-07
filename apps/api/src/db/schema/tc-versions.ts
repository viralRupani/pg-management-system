import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Published Terms & Conditions documents. A GLOBAL (non-tenant) table — same
 * class as `auth_identities`: deliberately NOT in `RLS_TABLES`, read/written via
 * the `app_user` pool with no RLS, because the T&C are platform-wide, not
 * per-PG. Only the platform super-admin publishes here.
 *
 * `version` is a monotonic integer (max+1 on publish); publishing a new version
 * supersedes everyone's prior acceptance, so all owners/managers are re-prompted.
 * `publishedByEmail` is an audit label taken from the platform-admin JWT — no FK,
 * because a platform admin has no `users` row.
 */
export const tcVersions = pgTable("tc_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull().unique(),
  body: text("body").notNull(),
  publishedByEmail: text("published_by_email"),
  publishedAt: timestamp("published_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TcVersionRow = typeof tcVersions.$inferSelect;
export type NewTcVersionRow = typeof tcVersions.$inferInsert;
