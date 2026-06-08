import {
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

  // Resident profile fields (null for managers)
  age: integer("age"),
  occupationType: text("occupation_type"), // OccupationType
  nativePlace: text("native_place"),
  emergencyContact: text("emergency_contact"),
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
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
