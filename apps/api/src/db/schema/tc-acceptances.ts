import { integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { authIdentities } from "./auth-identities";

/**
 * One row per (human credential, T&C version) accepted. A GLOBAL (non-tenant)
 * table — NOT in `RLS_TABLES`, on the `app_user` pool with no RLS.
 *
 * Keyed by `auth_identities.id`, the single stable per-human credential, because
 * a `users.id` is the wrong key here: an owner has NO `users` row on their global
 * token and a DIFFERENT one per PG. Acceptance must follow the credential, not
 * the per-PG actor. `unique(authIdentityId, version)` makes accept idempotent.
 * Cascades on the credential's deletion (a deactivated manager's identity is
 * deleted → their acceptances go with it).
 */
export const tcAcceptances = pgTable(
  "tc_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authIdentityId: uuid("auth_identity_id")
      .notNull()
      .references(() => authIdentities.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    identityVersionUnique: unique("tc_acceptances_identity_version_unique").on(
      t.authIdentityId,
      t.version,
    ),
  }),
);

export type TcAcceptanceRow = typeof tcAcceptances.$inferSelect;
export type NewTcAcceptanceRow = typeof tcAcceptances.$inferInsert;
