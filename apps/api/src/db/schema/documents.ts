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
 * A resident's KYC document (masked Aadhaar, driving licence, voter ID,
 * passport, or photograph — see DocumentType/DOCUMENT_TYPE_META). Stored as an
 * S3 key the manager reviews; lifecycle PENDING -> VERIFIED | REJECTED, guarded
 * in the service (same pattern as payments). Resident reads filter by
 * user_id = sub (RLS isolates tenants, not residents). Composite FKs keep
 * resident + reviewer in tenant. Purged (rows + S3 objects) when the resident
 * exits — see DepositsService.settleExit.
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
    contentType: text("content_type"), // MIME of the stored file (image/* | application/pdf)
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
    // At most one document per type per resident: a re-submit replaces the
    // existing row in place (DocumentsService.submit upserts on this target),
    // and the resident-list KYC rollup can left-join 1:1 without fan-out.
    residentTypeUnique: unique("documents_resident_id_type_unique").on(
      t.tenantId,
      t.residentId,
      t.type,
    ),
  }),
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
