import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Per-PG schedule for automatic monthly invoice generation. At most one row per
 * tenant (`unique(tenantId)`) — managers create/edit/delete it; deleting the row
 * reverts the PG to manual-only generation (opt-in).
 *
 * `dayOfMonth`/`hour`/`minute` are interpreted in IST. A single repeatable
 * dispatch job (every 15 min) reads these rows and fires due ones; the run is
 * guarded once-per-period by `lastRunPeriod` (the 'YYYY-MM' it last generated
 * for), which also gives catch-up semantics if the server was down at the
 * scheduled minute. It references only `tenants`, so a plain tenantId FK
 * suffices — no composite FK needed.
 */
export const invoiceSchedules = pgTable(
  "invoice_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    dayOfMonth: integer("day_of_month").notNull(), // 1-28 (IST)
    hour: integer("hour").notNull(), // 0-23 (IST)
    minute: integer("minute").notNull(), // 0-59 (IST)
    lastRunPeriod: text("last_run_period"), // 'YYYY-MM' of the last scheduled run
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantUnique: unique("invoice_schedules_tenant_id_unique").on(t.tenantId),
  }),
);

export type InvoiceScheduleRow = typeof invoiceSchedules.$inferSelect;
export type NewInvoiceScheduleRow = typeof invoiceSchedules.$inferInsert;
