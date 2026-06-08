import { z } from "zod";
import { TenantStatus } from "../enums";

/**
 * Platform metering. Billable event (CONFIRMED): ₹10 per active resident
 * (currently bed-allocated) per MONTH, recurring. Captured monthly in
 * `billing_snapshots`. Collection is manual (offline UPI) for now.
 */

/** ₹10 per active resident per month, in paise. */
export const BILLING_RATE_PAISE = 1000;

const periodString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be 'YYYY-MM'");

/** Super-admin triggers a snapshot for a month (defaults to the current month). */
export const snapshotRequestSchema = z.object({
  period: periodString.optional(),
});
export type SnapshotRequestInput = z.infer<typeof snapshotRequestSchema>;

/** A persisted monthly billing snapshot for one tenant. */
export const billingSnapshotSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  tenantName: z.string(),
  period: z.string(),
  activeResidents: z.number().int().nonnegative(),
  ratePaise: z.number().int().nonnegative(),
  amountDuePaise: z.number().int().nonnegative(),
});
export type BillingSnapshot = z.infer<typeof billingSnapshotSchema>;

/** Result of running a snapshot pass across all tenants. */
export const snapshotRunResultSchema = z.object({
  period: z.string(),
  tenantsSnapshotted: z.number().int().nonnegative(),
  totalActiveResidents: z.number().int().nonnegative(),
  totalAmountDuePaise: z.number().int().nonnegative(),
});
export type SnapshotRunResult = z.infer<typeof snapshotRunResultSchema>;

/** One row of the live super-admin overview (current headcount + revenue est). */
export const platformOverviewRowSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.nativeEnum(TenantStatus),
  activeResidents: z.number().int().nonnegative(),
  estimatedRevenuePaise: z.number().int().nonnegative(),
});
export type PlatformOverviewRow = z.infer<typeof platformOverviewRowSchema>;
