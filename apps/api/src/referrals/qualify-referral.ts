import { eq } from "drizzle-orm";
import { TenantContextService } from "../db/tenant-context";
import { referrals, tenants, users } from "../db/schema";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/**
 * Refer & earn: called the moment a resident gets their FIRST-EVER allocation
 * (immediate move-in in `AllocationService.allocate`, or a future-dated
 * booking activating in `BookingsService.activateDue`) — NOT at registration,
 * and NOT on a room transfer of an already-active resident (that's a
 * different resident lifecycle event, not "becoming billable").
 *
 * A no-op unless the resident was registered with a `referredByUserId` AND
 * the PG has a configured `referralDiscountPaise`. Otherwise records a
 * `referrals` row snapshotting today's configured amount — the earn event.
 * The actual rent reduction happens later, in `RentService.generateMonthly`,
 * which folds any unapplied `referrals` row into the referrer's next invoice.
 *
 * Call inside the same transaction as the allocation insert — this is a
 * simple, low-risk write that should be atomic with "resident became active",
 * unlike the deliberately best-effort late-join invoice generation next to it.
 */
export async function qualifyReferralIfAny(
  tx: Tx,
  tenantId: string,
  residentId: string,
): Promise<void> {
  const [resident] = await tx
    .select({ referredByUserId: users.referredByUserId })
    .from(users)
    .where(eq(users.id, residentId));
  if (!resident?.referredByUserId) return;

  const [tenant] = await tx
    .select({ referralDiscountPaise: tenants.referralDiscountPaise })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant?.referralDiscountPaise) return; // not configured for this PG

  await tx
    .insert(referrals)
    .values({
      tenantId,
      referrerId: resident.referredByUserId,
      referredId: residentId,
      discountPaise: tenant.referralDiscountPaise,
    })
    .onConflictDoNothing({
      target: [referrals.referredId, referrals.tenantId],
    });
}
