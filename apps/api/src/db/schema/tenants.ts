import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The PG organization (tenant). This table intentionally has NO RLS:
 *   - Onboarding writes happen via the platform (BYPASSRLS) pool.
 *   - The login screen needs to resolve branding by slug BEFORE any tenant
 *     context exists, so a narrow public "by-slug" read is required.
 * There is deliberately NO tenant-list endpoint on the tenant-scoped path, so
 * one PG can never enumerate the others (the white-labeling promise).
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Opaque storage key (like payments.screenshot_key / documents.s3_key); the
  // public download URL is presigned on read, never stored raw. NOTE: the DB
  // column keeps its original name `logo_url` for migration stability, but it
  // holds a KEY, not a URL — the TS field name `logoKey` is the source of truth.
  logoKey: text("logo_url"),
  accentColor: text("accent_color"),
  upiQrKey: text("upi_qr_key"),
  // The PG's UPI ID / VPA (e.g. `sunrise@okhdfcbank`) residents copy to pay.
  // Plain text — a public payment handle, not a secret.
  upiId: text("upi_id"),
  // Refer & earn: flat discount (paise) a referring resident gets off one
  // month's rent when the resident they referred is allocated a bed. Null =
  // feature not configured for this PG (referrals never qualify).
  referralDiscountPaise: integer("referral_discount_paise"),
  // Cap on how many referrals ONE resident can earn credit for. Null =
  // unlimited (the default). Independent of `referralDiscountPaise` so a
  // manager's chosen cap survives turning the discount off and back on.
  referralMaxCount: integer("referral_max_count"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
