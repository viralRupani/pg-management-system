import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as argon2 from "argon2";
import {
  type AuthTokens,
  type CreateManagerInput,
  type CreateOwnerPgInput,
  type JwtPayload,
  type ManagerSummary,
  type OwnerPgSummary,
  TenantStatus,
  UserRole,
} from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  authIdentities,
  owners,
  ownerTenants,
  tenants,
  users,
} from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from "../storage/storage.module";
import { AuthService } from "../auth/auth.service";
import { assertSlugFree, insertManager, insertTenant } from "../platform/onboarding.helpers";

/**
 * PG-owner operations. An owner spans multiple PGs, so two distinct surfaces:
 *
 *  - GLOBAL surface (list PGs / create PG / switch into a PG) is inherently
 *    cross-tenant and runs on the BYPASSRLS pool (PLATFORM_DB), exactly like
 *    platform onboarding — but EVERY call is gated by an `owner_tenants`
 *    membership row, so an owner can only ever touch a tenant they own.
 *
 *  - IN-PG surface (manager management) runs with the owner's PG-SCOPED token,
 *    so the request goes through the normal app_user pool + SET LOCAL + RLS
 *    (the interceptor sees role≠PLATFORM_ADMIN + a tenantId). Mechanically the
 *    owner is a manager-plus inside the PG; `ctx.db()` is RLS-bound.
 */
@Injectable()
export class OwnerService {
  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: Database,
    private readonly ctx: TenantContextService,
    private readonly auth: AuthService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // --- GLOBAL surface (cross-tenant, gated by owner_tenants membership) ---

  /**
   * Resolve the owner id from the JWT. A global token's `sub` IS the owner id; a
   * PG-scoped token's `sub` is the per-tenant PG_OWNER user row, so we map it
   * back via owner_tenants. Either way the owner endpoints work.
   */
  private async resolveOwnerId(user: JwtPayload): Promise<string> {
    if (user.tenantId == null) return user.sub;
    const link = await this.platformDb.query.ownerTenants.findFirst({
      where: and(
        eq(ownerTenants.userId, user.sub),
        eq(ownerTenants.tenantId, user.tenantId),
      ),
    });
    if (!link) throw new ForbiddenException("Not a PG owner");
    return link.ownerId;
  }

  /** List the PGs this owner owns, with branding for the chooser UI. */
  async listPgs(user: JwtPayload): Promise<OwnerPgSummary[]> {
    const ownerId = await this.resolveOwnerId(user);
    const rows = await this.platformDb
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        accentColor: tenants.accentColor,
        logoKey: tenants.logoKey,
      })
      .from(ownerTenants)
      .innerJoin(tenants, eq(tenants.id, ownerTenants.tenantId))
      .where(eq(ownerTenants.ownerId, ownerId))
      .orderBy(tenants.name);

    const counts = await this.activeCounts(rows.map((r) => r.id));

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status as TenantStatus,
        accentColor: r.accentColor,
        logoUrl: r.logoKey
          ? (await this.storage.presignDownload(r.logoKey)).downloadUrl
          : null,
        activeResidents: counts.get(r.id) ?? 0,
      })),
    );
  }

  /** Active (bed-allocated) resident count for the given tenant ids. */
  private async activeCounts(tenantIds: string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const rows = await this.platformDb
      .select({
        tenantId: allocations.tenantId,
        count: sql<number>`count(*)::int`,
      })
      .from(allocations)
      .where(
        and(isNull(allocations.endDate), inArray(allocations.tenantId, tenantIds)),
      )
      .groupBy(allocations.tenantId);
    return new Map(rows.map((r) => [r.tenantId, r.count]));
  }

  /**
   * Create a PG owned by this owner: the tenant, the owner's per-tenant PG_OWNER
   * `users` row (their in-PG actor), the owner_tenants link, and an optional
   * first manager — all in one BYPASSRLS transaction.
   */
  async createPg(
    user: JwtPayload,
    input: CreateOwnerPgInput,
  ): Promise<OwnerPgSummary> {
    const ownerId = await this.resolveOwnerId(user);

    return this.platformDb.transaction(async (tx) => {
      const owner = await tx.query.owners.findFirst({
        where: eq(owners.id, ownerId),
      });
      if (!owner) throw new NotFoundException("Owner not found");

      await assertSlugFree(tx, input.slug);
      const tenant = await insertTenant(tx, input);

      const [ownerUser] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          role: UserRole.PG_OWNER,
          name: owner.name,
          email: owner.email,
        })
        .returning();

      await tx.insert(ownerTenants).values({
        ownerId,
        tenantId: tenant.id,
        userId: ownerUser.id,
      });

      if (input.manager) {
        await insertManager(tx, tenant.id, input.manager);
      }

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: TenantStatus.ACTIVE,
        accentColor: tenant.accentColor,
        logoUrl: null,
        activeResidents: 0,
      };
    });
  }

  /**
   * Mint a PG-scoped token after verifying ownership. `sub` becomes the owner's
   * per-tenant PG_OWNER user row so in-PG actor FKs resolve; role stays PG_OWNER
   * so owner-only routes remain reachable inside the PG.
   */
  async switchPg(user: JwtPayload, tenantId: string): Promise<AuthTokens> {
    const ownerId = await this.resolveOwnerId(user);
    const link = await this.platformDb.query.ownerTenants.findFirst({
      where: and(
        eq(ownerTenants.ownerId, ownerId),
        eq(ownerTenants.tenantId, tenantId),
      ),
    });
    if (!link) throw new ForbiddenException("You do not own this PG");

    return this.auth.issueTokensFor({
      sub: link.userId,
      tenantId,
      role: UserRole.PG_OWNER,
    });
  }

  // --- IN-PG surface (PG-scoped token → RLS context via ctx.db()) ---

  /** Guard: in-PG owner routes require a PG-scoped token (SET LOCAL ran). */
  private requireTenant(): string {
    const tenantId = this.ctx.currentTenantId();
    if (!tenantId) {
      throw new BadRequestException("Select a PG first (no active PG context)");
    }
    return tenantId;
  }

  /** Managers in the active PG (RLS scopes to the tenant). */
  async listManagers(): Promise<ManagerSummary[]> {
    this.requireTenant();
    const rows = await this.ctx
      .db()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        deactivatedAt: users.deactivatedAt,
      })
      .from(users)
      .where(eq(users.role, UserRole.PG_MANAGER))
      .orderBy(users.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      deactivatedAt: r.deactivatedAt ? r.deactivatedAt.toISOString() : null,
    }));
  }

  /** Add a manager to the active PG. */
  async addManager(input: CreateManagerInput): Promise<ManagerSummary> {
    const tenantId = this.requireTenant();
    const db = this.ctx.db();

    // Email is globally unique in auth_identities (no RLS) — pre-check for a
    // clean 409; the unique index is the concurrency backstop.
    const clash = await db.query.authIdentities.findFirst({
      where: eq(authIdentities.email, input.email),
    });
    if (clash) {
      throw new ConflictException(`Email '${input.email}' is already in use`);
    }

    const passwordHash = await argon2.hash(input.password);

    // users insert passes RLS WITH CHECK because tenantId = the context tenant.
    const [manager] = await db
      .insert(users)
      .values({
        tenantId,
        role: UserRole.PG_MANAGER,
        name: input.name,
        email: input.email,
        phone: input.phone,
      })
      .returning();

    // auth_identities has NO RLS → set tenantId explicitly (never from input).
    // mustChangePassword: the owner sets a temp password; the manager must replace
    // it on first login before they can access the app.
    await db.insert(authIdentities).values({
      tenantId,
      role: UserRole.PG_MANAGER,
      userId: manager.id,
      email: input.email,
      phone: input.phone,
      passwordHash,
      mustChangePassword: true,
    });

    return {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      phone: manager.phone,
      deactivatedAt: null,
    };
  }

  /**
   * Soft-deactivate a manager: revoke their login (delete the auth_identities
   * credential) but KEEP the `users` row, because actor FKs (reviewedBy/…)
   * RESTRICT on delete and the audit trail must survive. The role filter ensures
   * an owner can't target a PG_OWNER row or a resident.
   */
  async deactivateManager(managerId: string): Promise<void> {
    const tenantId = this.requireTenant();
    const db = this.ctx.db();

    const [updated] = await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(and(eq(users.id, managerId), eq(users.role, UserRole.PG_MANAGER)))
      .returning({ id: users.id });
    if (!updated) throw new NotFoundException("Manager not found");

    // No-RLS table → scope the credential delete explicitly by tenant + role.
    await db
      .delete(authIdentities)
      .where(
        and(
          eq(authIdentities.userId, managerId),
          eq(authIdentities.tenantId, tenantId),
          eq(authIdentities.role, UserRole.PG_MANAGER),
        ),
      );
  }
}
