import { ConflictException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import { TenantStatus, UserRole } from "@pg/shared";
import type { DatabaseTx } from "../db/database.module";
import { authIdentities, tenants, users } from "../db/schema";

/**
 * Shared PG-creation primitives used by BOTH platform onboarding and owner
 * create-PG, so the two paths can't drift. All run on the BYPASSRLS pool inside
 * a caller-provided transaction (a tenant context doesn't exist yet at create
 * time). Keep these pure (take `tx`) rather than methods so either service can
 * compose them in its own transaction.
 */

export interface ManagerSeed {
  name: string;
  email: string;
  password: string;
  phone: string;
}

/** Throws 409 if the slug is taken (slug is globally unique). */
export async function assertSlugFree(
  tx: DatabaseTx,
  slug: string,
): Promise<void> {
  const existing = await tx.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });
  if (existing) {
    throw new ConflictException(`PG code '${slug}' is already taken`);
  }
}

export interface TenantSeed {
  name: string;
  slug: string;
  logoKey?: string | null;
  accentColor?: string | null;
}

/** Inserts the PG row (status ACTIVE). Assumes the slug was already checked. */
export async function insertTenant(tx: DatabaseTx, seed: TenantSeed) {
  const [tenant] = await tx
    .insert(tenants)
    .values({
      name: seed.name,
      slug: seed.slug,
      logoKey: seed.logoKey ?? null,
      accentColor: seed.accentColor ?? null,
      status: TenantStatus.ACTIVE,
    })
    .returning();
  return tenant;
}

/**
 * Inserts a PG_MANAGER `users` profile row + its `auth_identities` credential
 * (argon2-hashed). Email is globally unique → a duplicate raises a unique
 * violation the caller can surface as 409.
 */
export async function insertManager(
  tx: DatabaseTx,
  tenantId: string,
  m: ManagerSeed,
) {
  const passwordHash = await argon2.hash(m.password);
  const [manager] = await tx
    .insert(users)
    .values({
      tenantId,
      role: UserRole.PG_MANAGER,
      name: m.name,
      email: m.email,
      phone: m.phone,
    })
    .returning();

  await tx.insert(authIdentities).values({
    tenantId,
    role: UserRole.PG_MANAGER,
    userId: manager.id,
    email: m.email,
    phone: m.phone,
    passwordHash,
  });

  return manager;
}
