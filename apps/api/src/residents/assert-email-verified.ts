import { ConflictException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { UserRole } from "@pg/shared";
import type { TenantContextService } from "../db/tenant-context";
import { users } from "../db/schema";

/**
 * Guard: a long-term resident's email must be verified before they can be given
 * a bed (allocation or booking). Email is the interim resident notification
 * channel (until real push infra), so we refuse to start a tenancy on an
 * unverified — possibly typo'd/undeliverable — address. Short-stay guests are
 * exempt (no app login, no ongoing notifications, may have no email).
 *
 * Called BEFORE the allocation/booking txn on the resident id already validated
 * to exist. Runs under tenant RLS via the passed db handle. Mirrors the
 * standalone-guard style of `assertNoUnsettledAdjustment`.
 */
export async function assertEmailVerified(
  db: ReturnType<TenantContextService["db"]>,
  residentId: string,
): Promise<void> {
  const [resident] = await db
    .select({
      emailVerified: users.emailVerified,
      isShortStay: users.isShortStay,
    })
    .from(users)
    .where(and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)))
    .limit(1);

  // No row = caller's existence check will have thrown already; be defensive.
  if (resident && !resident.isShortStay && !resident.emailVerified) {
    throw new ConflictException(
      "Verify the resident's email before assigning a bed",
    );
  }
}
