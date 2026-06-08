import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import {
  type CreateTenantInput,
  type TenantSummary,
  TenantStatus,
  UserRole,
} from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { authIdentities, tenants, users } from "../db/schema";

/**
 * Platform/super-admin operations that legitimately span tenants. The ONLY
 * place the BYPASSRLS pool is used. Onboarding creates a PG plus its first
 * manager in one transaction.
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(PLATFORM_DB) private readonly db: Database) {}

  async onboardTenant(input: CreateTenantInput): Promise<TenantSummary> {
    const existing = await this.db.query.tenants.findFirst({
      where: eq(tenants.slug, input.slug),
    });
    if (existing) {
      throw new ConflictException(`PG code '${input.slug}' is already taken`);
    }

    const passwordHash = await argon2.hash(input.manager.password);

    return this.db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          logoKey: input.logoKey ?? null,
          accentColor: input.accentColor ?? null,
          status: TenantStatus.ACTIVE,
        })
        .returning();

      const [manager] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          role: UserRole.PG_MANAGER,
          name: input.manager.name,
          email: input.manager.email,
          phone: input.manager.phone,
        })
        .returning();

      await tx.insert(authIdentities).values({
        tenantId: tenant.id,
        role: UserRole.PG_MANAGER,
        userId: manager.id,
        email: input.manager.email,
        phone: input.manager.phone,
        passwordHash,
      });

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
