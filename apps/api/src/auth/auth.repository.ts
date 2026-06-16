import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { UserRole } from "@pg/shared";
import { APP_DB, type Database } from "../db/database.module";
import { authIdentities, tenants } from "../db/schema";

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
