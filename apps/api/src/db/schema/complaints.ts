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
 * A resident-filed complaint. Resident-OWNED: resident reads/writes filter by
 * user_id = sub (RLS isolates tenants, not residents). Status OPEN ->
 * IN_PROGRESS -> RESOLVED (plain update — no irreversible side effect, so no
 * conditional-flip guard needed). Optional photo via the storage 'complaints'
 * kind. `unique(id, tenant_id)` is the composite-FK target for complaint_updates.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    category: text("category").notNull(), // ComplaintCategory
    description: text("description").notNull(),
    photoKey: text("photo_key"),
    status: text("status").notNull().default("OPEN"), // ComplaintStatus
    assignedToUserId: uuid("assigned_to_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "complaints_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    assigneeFk: foreignKey({
      columns: [t.assignedToUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "complaints_assigned_to_user_id_tenant_id_fk",
    }),
    idTenant: unique("complaints_id_tenant_id_unique").on(t.id, t.tenantId),
  }),
);

export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
