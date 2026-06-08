import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
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
}
