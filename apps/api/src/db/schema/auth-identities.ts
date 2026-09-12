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
 * Uniqueness rules (market: people move between PGs, so per-PG uniqueness only
 * for phone AND for resident email):
 *   - Managers / platform admins log in by EMAIL  -> email globally unique
 *     (role <> RESIDENT).
 *   - Residents log in by (PG slug + EMAIL)        -> (tenant_id, email)
 *     unique for role = RESIDENT. Email-OTP login replaced phone-OTP login
 *     (SMS costs money; see docs/backlog.md) — `phone` is still written on
 *     registration and stays (tenant_id, phone)-unique so SMS login can be
 *     revived later with zero data migration; it's just not read at login.
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
    // Manager/owner/platform-admin email is unique system-wide.
    uniqueIndex("auth_email_unique")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL AND ${t.role} <> 'RESIDENT'`),
    // Resident email (the login key) is unique only within a tenant — same
    // per-PG shape as phone below.
    uniqueIndex("auth_tenant_resident_email_unique")
      .on(t.tenantId, t.email)
      .where(sql`${t.email} IS NOT NULL AND ${t.role} = 'RESIDENT'`),
    // Phone is unique only within a tenant, when present. Not read at login
    // today (SMS_OTP_LOGIN_DISABLED) but kept enforced for a future revival.
    uniqueIndex("auth_tenant_phone_unique")
      .on(t.tenantId, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
    index("auth_tenant_idx").on(t.tenantId),
  ],
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type NewAuthIdentity = typeof authIdentities.$inferInsert;
