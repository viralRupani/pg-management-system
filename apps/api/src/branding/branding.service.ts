import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  type PresignedUploadResult,
  type TenantBranding,
  type UpdateBrandingInput,
} from "@pg/shared";
import { APP_DB, type Database } from "../db/database.module";
import { TenantContextService } from "../db/tenant-context";
import { tenants } from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  assertAllowedType,
} from "../storage/storage.module";

/**
 * White-labeling. `tenants` has NO RLS (the login/branding screen must resolve a
 * PG before any tenant context exists), so:
 *  - the PUBLIC by-slug read uses the app_user pool directly (APP_DB) — never the
 *    BYPASSRLS platform pool — exactly like login lookups, keeping its blast
 *    radius to branding only;
 *  - the MANAGER self-service update runs inside the request's tenant context but
 *    MUST scope `where id = currentTenantId()` EXPLICITLY (the no-RLS analog of
 *    "never trust request input"): RLS can't fence this table, so the id from the
 *    JWT is the only thing that keeps a manager editing their own PG.
 * There is deliberately no tenant-LIST endpoint, so a PG can't enumerate others.
 */
@Injectable()
export class BrandingService {
  constructor(
    @Inject(APP_DB) private readonly appDb: Database,
    private readonly ctx: TenantContextService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** PUBLIC: branding for the login screen, resolved by slug. */
  async getBySlug(slug: string): Promise<TenantBranding> {
    const row = await this.appDb.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    if (!row) throw new NotFoundException("PG not found");
    return this.toBranding(row);
  }

  /** Manager: their own PG's current branding. */
  async getOwn(): Promise<TenantBranding> {
    const tenantId = this.ctx.currentTenantId()!;
    const [row] = await this.ctx
      .db()
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!row) throw new NotFoundException("PG not found");
    return this.toBranding(row);
  }

  /** Resolve a stored logo key into a presigned download URL (null if unset). */
  private async toBranding(
    row: typeof tenants.$inferSelect,
  ): Promise<TenantBranding> {
    const logoUrl = row.logoKey
      ? (await this.storage.presignDownload(row.logoKey)).downloadUrl
      : null;
    return {
      name: row.name,
      slug: row.slug,
      logoUrl,
      accentColor: row.accentColor,
    };
  }

  /** Manager: update their own PG's branding (scoped to the JWT tenant id). */
  async updateOwn(input: UpdateBrandingInput): Promise<TenantBranding> {
    const tenantId = this.ctx.currentTenantId()!;
    const patch: Partial<typeof tenants.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.logoKey !== undefined) patch.logoKey = input.logoKey;
    if (input.accentColor !== undefined) patch.accentColor = input.accentColor;

    const [row] = await this.ctx
      .db()
      .update(tenants)
      .set(patch)
      .where(eq(tenants.id, tenantId)) // explicit: tenants has no RLS
      .returning();
    if (!row) throw new NotFoundException("PG not found");
    return this.toBranding(row);
  }

  /** Manager: presigned URL to upload a new logo (tenant-namespaced key). */
  async requestLogoUploadUrl(
    contentType: string,
  ): Promise<PresignedUploadResult> {
    assertAllowedType("logos", contentType);
    return this.storage.presignUpload({
      tenantId: this.ctx.currentTenantId()!,
      kind: "logos",
      contentType,
    });
  }
}
