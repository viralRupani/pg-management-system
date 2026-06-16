import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

/**
 * Credential / login-lookup table. Deliberately has NO RLS so that login can
 * resolve a user BEFORE any tenant context exists, while keeping the BYPASSRLS
 * pool reserved strictly for the platform module. Blast radius if this table
 * leaks = contact + password hash only (no PG operational data).
 *
 * Uniqueness rules (market: people move between PGs, phone is per-PG):
 *   - Managers / platform admins log in by EMAIL  -> email globally unique.
 *   - Residents log in by (PG slug + PHONE)        -> (tenant_id, phone) unique.
 */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null only for PLATFORM_ADMIN
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull(), // UserRole
    // Profile row this identity authenticates (null for platform admin).
    userId: uuid("user_id"),
    email: text("email"),
    phone: text("phone"),
    passwordHash: text("password_hash"), // null for OTP-only residents
    // Set true when an owner creates a manager with a temp password; cleared on
    // first successful password change so the manager must set their own credential.
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Email is unique across the whole system, when present.
    uniqueIndex("auth_email_unique")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
    // Phone is unique only within a tenant, when present.
    uniqueIndex("auth_tenant_phone_unique")
      .on(t.tenantId, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
    index("auth_tenant_idx").on(t.tenantId),
  ],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
