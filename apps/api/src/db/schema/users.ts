import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
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

  // Planned move-in (long-term) / check-in (short stay) date captured at
  // registration, before a bed is assigned. Used to pre-fill + filter the
  // bed-assign dialog. YYYY-MM-DD.
  expectedMoveInDate: date("expected_move_in_date"),

  // Short-stay guest: a transient occupant who pays a per-day charge upfront and
  // is never invoiced or metered (never gets an `allocations` row — bed
  // occupancy is tracked via `short_stays` + TRANSIENT bed status). When true,
  // checkOut + per-day charge are set.
  isShortStay: boolean("is_short_stay").notNull().default(false),
  shortStayCheckOutDate: date("short_stay_check_out_date"), // YYYY-MM-DD
  shortStayPerDayChargePaise: integer("short_stay_per_day_charge_paise"),

  // Resident-initiated move-out request (manager-driven exit is separate; see
  // DepositsService.settleExit). null = no request pending; all three are set
  // together when the resident raises a request.
  exitRequestedDate: date("exit_requested_date"), // preferred move-out 'YYYY-MM-DD'
  exitRequestNote: text("exit_request_note"),
  exitRequestedAt: timestamp("exit_requested_at", { withTimezone: true }),

  // Manager soft-deactivation (set by an owner). null = active; when set, the
  // login credential in auth_identities is removed but this row is KEPT so the
  // actor FKs (reviewedBy/recordedBy/…) that RESTRICT on delete stay intact.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),

  // Provenance: the manager (or PG owner) user row that registered this
  // resident, captured from the JWT `sub` at register time. Null for residents
  // created outside the register flow (seeds) or before this was tracked. FK is
  // to `users` (not `auth_identities`) so the name still resolves after the
  // manager is soft-deactivated (row kept, credential removed).
  createdByUserId: uuid("created_by_user_id"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // Self-referential composite FK carrying tenant_id — the creator is another
  // `users` row in the same tenant; the tenant column keeps it in-tenant (FK
  // checks bypass RLS).
  createdByFk: foreignKey({
    columns: [t.createdByUserId, t.tenantId],
    foreignColumns: [t.id, t.tenantId],
    name: "users_created_by_user_id_tenant_id_fk",
  }),
  // Composite-unique target so child tables (e.g. allocations.residentId) can
  // reference (id, tenant_id) and make cross-tenant references unrepresentable.
  // FK/unique checks bypass RLS, so tenant scoping must be enforced in the FK.
  idTenant: unique("users_id_tenant_id_unique").on(t.id, t.tenantId),
  // `users` is shared by managers + residents; managers legitimately have a
  // null age, so age is mandatory only for residents (not a column NOT NULL).
  // Short-stay guests are lightweight (name + phone only), so they're exempt too.
  residentAgeRequired: check(
    "users_resident_age_required",
    sql`${t.role} <> 'RESIDENT' OR ${t.age} IS NOT NULL OR ${t.isShortStay}`,
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
