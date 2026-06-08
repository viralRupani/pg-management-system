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
 * Monthly platform-billing snapshot: the billable headcount (active = currently
 * bed-allocated residents) per tenant per period, plus the rate and computed
 * amount DENORMALIZED so a past period keeps the rate it was billed at — as long
 * as it is not re-run. `unique(tenant_id, period)` makes snapshotting idempotent
 * and REFRESHABLE: re-running a period recomputes its count AND rate at the
 * current values (the normal cadence only ever snapshots the current month). `tenant_id` is a plain FK to the tenant root (not the composite
 * pattern — there is no tenant-scoped parent; the tenant IS the reference).
 *
 * Written and read ONLY by the platform module via the BYPASSRLS pool — this is
 * legitimately cross-tenant metering. It still carries RLS (in RLS_TABLES) as
 * defense-in-depth: if anything ever queried it on the app_user (tenant) path it
 * would fail closed; platform_user bypasses RLS so metering is unaffected.
 */
export const billingSnapshots = pgTable(
  "billing_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'YYYY-MM'
    activeResidents: integer("active_residents").notNull(),
    ratePaise: integer("rate_paise").notNull(),
    amountDuePaise: integer("amount_due_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    perPeriod: unique("billing_snapshots_tenant_period_unique").on(
      t.tenantId,
      t.period,
    ),
  }),
);

export type BillingSnapshotRow = typeof billingSnapshots.$inferSelect;
export type NewBillingSnapshot = typeof billingSnapshots.$inferInsert;
