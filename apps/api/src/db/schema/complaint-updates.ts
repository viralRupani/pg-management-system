import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { complaints } from "./complaints";

/**
 * A note on a complaint thread (from the resident or a manager). The author is
 * always set from the JWT sub; a resident may only post to a complaint they own
 * (checked in the service). Composite FK keeps the complaint + author in tenant.
 */
export const complaintUpdates = pgTable(
  "complaint_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    complaintId: uuid("complaint_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    complaintFk: foreignKey({
      columns: [t.complaintId, t.tenantId],
      foreignColumns: [complaints.id, complaints.tenantId],
      name: "complaint_updates_complaint_id_tenant_id_fk",
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.authorUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "complaint_updates_author_user_id_tenant_id_fk",
    }),
  }),
);

export type ComplaintUpdate = typeof complaintUpdates.$inferSelect;
export type NewComplaintUpdate = typeof complaintUpdates.$inferInsert;
