import { z } from "zod";

/**
 * Refer & earn: the flat discount (paise) a referring resident gets off one
 * month's rent when the resident they referred is allocated a bed. At most
 * one setting row per tenant (lives on `tenants.referral_discount_paise`).
 * Used for both create and edit (the endpoint upserts). Delete clears it back
 * to null — referrals stop qualifying, but past ones already earned/applied
 * are untouched.
 *
 * `maxReferrals` caps how many referrals ONE resident can earn credit for —
 * null (or omitted) means unlimited, the default. Omitting it on a PUT leaves
 * the currently-stored cap untouched (a partial update), so existing callers
 * that only send `discountPaise` don't accidentally reset it.
 */
export const referralSettingsInputSchema = z.object({
  discountPaise: z.number().int().min(1),
  maxReferrals: z.number().int().min(1).nullable().optional(),
});
export type ReferralSettingsInput = z.infer<typeof referralSettingsInputSchema>;

/** The stored setting as returned to the manager UI (null when not configured). */
export const referralSettingsSchema = z.object({
  discountPaise: z.number().int().nullable(),
  maxReferrals: z.number().int().nullable(),
});
export type ReferralSettings = z.infer<typeof referralSettingsSchema>;

/** One referral a resident has made, shown on their profile's "Referrals" list. */
export const referralSummarySchema = z.object({
  id: z.string().uuid(),
  referredResidentId: z.string().uuid(),
  referredName: z.string(),
  referredPhone: z.string().nullable(),
  discountPaise: z.number().int(),
  qualifiedAt: z.string(),
  // null = qualified but not yet applied to an invoice (waiting on the
  // referrer's next billing run).
  appliedToInvoiceId: z.string().uuid().nullable(),
  appliedAt: z.string().nullable(),
});
export type ReferralSummary = z.infer<typeof referralSummarySchema>;
