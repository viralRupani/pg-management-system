import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * A resident's KYC / security document (Aadhaar, PAN, photo, agreement). Stored
 * as an S3 key the manager reviews; lifecycle PENDING -> VERIFIED | REJECTED,
 * guarded in the service (same pattern as payments). Resident reads filter by
 * user_id = sub (RLS isolates tenants, not residents). Composite FKs keep
 * resident + reviewer in tenant.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id").notNull(),
    type: text("type").notNull(), // DocumentType
    s3Key: text("s3_key").notNull(),
    status: text("status").notNull().default("PENDING"), // DocumentStatus
    reviewNote: text("review_note"),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    residentFk: foreignKey({
      columns: [t.residentId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "documents_resident_id_tenant_id_fk",
    }).onDelete("cascade"),
    reviewerFk: foreignKey({
      columns: [t.reviewedByUserId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "documents_reviewed_by_user_id_tenant_id_fk",
    }),
  }),
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
