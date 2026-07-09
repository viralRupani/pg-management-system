import {
  foreignKey,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";
import { invoices } from "./invoices";

/**
 * Refer & earn: one row per resident who qualified as a referral (i.e. the
 * referred resident was allocated a bed — see `qualifyReferralIfAny`). Not
 * created at registration time; `users.referred_by_user_id` records intent,
 * this table records the earned, billable event.
 *
 * `discount_paise` is a SNAPSHOT of `tenants.referral_discount_paise` at
 * qualification time, so a later change to the PG's configured amount never
 * retroactively rewrites an already-qualified-but-unapplied referral.
 *
 * `applied_to_invoice_id IS NULL` = not yet consumed — the same once-marker
 * idiom as `rent_adjustments`. `RentService.generateMonthly` folds unapplied
 * rows into the referrer's next invoice exactly once, stamping
 * `applied_to_invoice_id` + `applied_at`. Composite FKs keep referrer +
 * referred + invoice in-tenant.
 */
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    referrerId: uuid("referrer_id").notNull(),
    referredId: uuid("referred_id").notNull(),
    discountPaise: integer("discount_paise").notNull(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedToInvoiceId: uuid("applied_to_invoice_id"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    referrerFk: foreignKey({
      columns: [t.referrerId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "referrals_referrer_id_tenant_id_fk",
    }).onDelete("cascade"),
    referredFk: foreignKey({
      columns: [t.referredId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
      name: "referrals_referred_id_tenant_id_fk",
    }).onDelete("cascade"),
    invoiceFk: foreignKey({
      columns: [t.appliedToInvoiceId, t.tenantId],
      foreignColumns: [invoices.id, invoices.tenantId],
      name: "referrals_applied_to_invoice_id_tenant_id_fk",
    }).onDelete("set null"),
    // A resident qualifies as a referral at most once.
    referredUnique: unique("referrals_referred_id_tenant_id_unique").on(
      t.referredId,
      t.tenantId,
    ),
  }),
);

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
