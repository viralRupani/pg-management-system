import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { ResidentStatus, UserRole } from "@pg/shared";
import {
  APP_DB,
  type Database,
  type DatabaseTx,
} from "../db/database.module";
import { allocations, authIdentities, tenants, users } from "../db/schema";

/**
 * Auth lookups against the NON-RLS tables (auth_identities, tenants). Uses the
 * app_user pool — NOT the BYPASSRLS platform pool — so login can never reach
 * tenant operational data. These tables carry no PG operational data, only
 * contact + credential mapping and public branding.
 */
@Injectable()
export class AuthRepository {
  constructor(@Inject(APP_DB) private readonly db: Database) {}

  findIdentityByEmail(email: string) {
    return this.db.query.authIdentities.findFirst({
      where: eq(authIdentities.email, email),
    });
  }

  async resolveTenantBySlug(slug: string) {
    return this.db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
  }

  findResidentIdentity(tenantId: string, phone: string) {
    return this.db.query.authIdentities.findFirst({
      where: and(
        eq(authIdentities.tenantId, tenantId),
        eq(authIdentities.phone, phone),
      ),
    });
  }

  /**
   * Whether a resident is still entitled to use the mobile / web app. A manager
   * ends a resident's stay in one of two ways, and this locks BOTH out:
   *   - "Move out" (`allocations.moveOut`) ends the allocation, leaving
   *     `users.status = ACTIVE`;
   *   - "Settle exit" (`deposits.settleExit`) sets `users.status = EXITED`.
   *
   * Decided status-first, history-second (the order is load-bearing):
   *   1. `UPCOMING` → allow (booked for a future move-in; may also carry an
   *      older ended allocation if they left and were re-booked).
   *   2. `EXITED` → block (settled; gone — even if never bed-allocated).
   *   3. `ACTIVE` with a live allocation (`endDate` null) → allow (living here).
   *   4. `ACTIVE`, no live allocation → allow ONLY with NO allocation history:
   *      a freshly-registered resident mid-onboarding (KYC before bed
   *      assignment). If they had one that ended, they've been moved out → block.
   *
   * `users` and `allocations` are RLS-protected, so this MUST run inside a
   * `TenantContextService.run(tenantId, …)` scope — `tx` is the tenant-bound
   * handle. Called without a context, RLS fail-closes to zero rows → `false`.
   */
  async residentHasAccess(tx: DatabaseTx, userId: string): Promise<boolean> {
    const [user] = await tx
      .select({ status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.role, UserRole.RESIDENT)));
    if (!user) return false;
    if (user.status === ResidentStatus.UPCOMING) return true;
    if (user.status === ResidentStatus.EXITED) return false;

    // ACTIVE: a live allocation means they're staying.
    const [active] = await tx
      .select({ id: allocations.id })
      .from(allocations)
      .where(
        and(eq(allocations.residentId, userId), isNull(allocations.endDate)),
      )
      .limit(1);
    if (active) return true;

    // No live allocation: onboarding (never allocated) → allow; an ended
    // allocation → moved out → block.
    const [everAllocated] = await tx
      .select({ id: allocations.id })
      .from(allocations)
      .where(eq(allocations.residentId, userId))
      .limit(1);
    return everAllocated === undefined;
  }

  /**
   * The credential row backing a (userId, tenantId) principal. Used on refresh
   * to confirm the account is still live: deactivating a manager DELETES this
   * row, so its absence means access must not be re-minted. `auth_identities`
   * has no RLS, so this resolves without a tenant context (like login).
   */
  findIdentityByUserId(userId: string, tenantId: string) {
    return this.db.query.authIdentities.findFirst({
      where: and(
        eq(authIdentities.userId, userId),
        eq(authIdentities.tenantId, tenantId),
      ),
    });
  }

  /**
   * The credential row for the JWT principal, used by change-password. A
   * manager's row carries `tenantId` (PG-scoped token); an owner's single
   * credential row has `tenantId = NULL` and is only addressable on the owner's
   * global token (where `sub = owners.id`). `eq(col, null)` compiles to `= NULL`
   * (always false), so the null case MUST use `isNull`.
   */
  findIdentityForPrincipal(
    userId: string,
    tenantId: string | null,
    role: UserRole,
  ) {
    return this.db.query.authIdentities.findFirst({
      where: and(
        eq(authIdentities.userId, userId),
        eq(authIdentities.role, role),
        tenantId === null
          ? isNull(authIdentities.tenantId)
          : eq(authIdentities.tenantId, tenantId),
      ),
    });
  }

  findIdentityById(id: string) {
    return this.db.query.authIdentities.findFirst({
      where: eq(authIdentities.id, id),
    });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db
      .update(authIdentities)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(authIdentities.id, id));
  }
}
