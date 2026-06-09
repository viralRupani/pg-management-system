import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Tenant-scoped person profile (manager or resident). RLS-protected: every row
 * carries tenant_id and is only visible/insertable under the matching tenant
 * context. Credentials live in `auth_identities`, not here.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // UserRole (PG_MANAGER | RESIDENT)
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),

  // Resident profile fields (null for managers — see role-conditional CHECKs)
  age: integer("age"),
  occupationType: text("occupation_type"), // OccupationType
  nativePlace: text("native_place"),
  // Emergency contact person (all-or-nothing — see users_emergency_all_or_none).
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactRelation: text("emergency_contact_relation"), // EmergencyRelation
  emergencyContactPhone: text("emergency_contact_phone"),
  status: text("status").notNull().default("ACTIVE"), // ResidentStatus
  joinDate: timestamp("join_date", { withTimezone: true }),

  // Manager soft-deactivation (set by an owner). null = active; when set, the
  // login credential in auth_identities is removed but this row is KEPT so the
  // actor FKs (reviewedBy/recordedBy/…) that RESTRICT on delete stay intact.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // Composite-unique target so child tables (e.g. allocations.residentId) can
  // reference (id, tenant_id) and make cross-tenant references unrepresentable.
  // FK/unique checks bypass RLS, so tenant scoping must be enforced in the FK.
  idTenant: unique("users_id_tenant_id_unique").on(t.id, t.tenantId),
  // `users` is shared by managers + residents; managers legitimately have a
  // null age, so age is mandatory only for residents (not a column NOT NULL).
  residentAgeRequired: check(
    "users_resident_age_required",
    sql`${t.role} <> 'RESIDENT' OR ${t.age} IS NOT NULL`,
  ),
  // The emergency contact is optional but all-or-nothing: all three columns
  // null, or all three set.
  emergencyAllOrNone: check(
    "users_emergency_all_or_none",
    sql`(${t.emergencyContactName} IS NULL AND ${t.emergencyContactRelation} IS NULL AND ${t.emergencyContactPhone} IS NULL)
        OR (${t.emergencyContactName} IS NOT NULL AND ${t.emergencyContactRelation} IS NOT NULL AND ${t.emergencyContactPhone} IS NOT NULL)`,
  ),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
