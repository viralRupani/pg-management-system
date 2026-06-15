import { and, eq } from "drizzle-orm";
import { BedStatus, BookingStatus } from "@pg/shared";
import { TenantContextService } from "./tenant-context";
import { beds, bookings } from "./schema";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/**
 * Release a bed when a resident vacates it. Hand it to a waiting future-dated
 * booking (→ RESERVED) if one is PENDING for this bed, else mark it VACANT.
 *
 * Centralised so EVERY vacate path agrees — exit settlement, plain move-out, and
 * a room transfer's old-bed release. A bed with a pending booking must never be
 * left VACANT: the activation job inserts the allocation against it, and a stray
 * VACANT would let someone else take the bed first (or strand the booking on the
 * per-bed unique index). Call inside the same transaction as the allocation end.
 */
export async function freeBed(tx: Tx, bedId: string): Promise<void> {
  const [pending] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.bedId, bedId), eq(bookings.status, BookingStatus.PENDING)),
    );
  await tx
    .update(beds)
    .set({ status: pending ? BedStatus.RESERVED : BedStatus.VACANT })
    .where(eq(beds.id, bedId));
}
