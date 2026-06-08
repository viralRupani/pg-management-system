import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import {
  type CreateOwnerInput,
  type CreateTenantInput,
  type OwnerSummary,
  type TenantSummary,
  TenantStatus,
  UserRole,
} from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { authIdentities, owners, tenants } from "../db/schema";
import { assertSlugFree, insertManager, insertTenant } from "./onboarding.helpers";

/**
 * Platform/super-admin operations that legitimately span tenants. The ONLY
 * place the BYPASSRLS pool is used. Onboarding creates a PG plus its first
 * manager in one transaction.
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(PLATFORM_DB) private readonly db: Database) {}

  async onboardTenant(input: CreateTenantInput): Promise<TenantSummary> {
    return this.db.transaction(async (tx) => {
      await assertSlugFree(tx, input.slug);
      const tenant = await insertTenant(tx, input);
      await insertManager(tx, tenant.id, input.manager);
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: TenantStatus.ACTIVE,
        activeResidents: 0,
      };
    });
  }

  /**
   * Create a PG owner: a cross-tenant identity (no tenant_id) plus its login
   * credential. The owner then creates their own PGs via the owner module.
   * Email is globally unique in auth_identities → duplicate raises 409.
   */
  async createOwner(input: CreateOwnerInput): Promise<OwnerSummary> {
    const existing = await this.db.query.authIdentities.findFirst({
      where: eq(authIdentities.email, input.email),
    });
    if (existing) {
      throw new ConflictException(`Email '${input.email}' is already in use`);
    }

    const passwordHash = await argon2.hash(input.password);

    return this.db.transaction(async (tx) => {
      const [owner] = await tx
        .insert(owners)
        .values({ name: input.name, email: input.email })
        .returning();

      await tx.insert(authIdentities).values({
        tenantId: null,
        role: UserRole.PG_OWNER,
        userId: owner.id,
        email: input.email,
        passwordHash,
      });

      return { id: owner.id, name: owner.name, email: owner.email };
    });
  }

  /**
   * Active tenant ids for cross-tenant batch jobs (invoice generation,
   * reminders). Reads via the platform BYPASSRLS pool — the legitimate
   * cross-tenant path. Jobs then re-enter each tenant under RLS context to do
   * the per-tenant work, so they never run business logic on this pool.
   */
  async listActiveTenantIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));
    return rows.map((r) => r.id);
  }
}
