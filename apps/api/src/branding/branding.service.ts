import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  type PaymentInfo,
  type PresignedUploadResult,
  type SlugAvailability,
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

  /** Resolve stored keys into presigned download URLs (null if unset). */
  private async toBranding(
    row: typeof tenants.$inferSelect,
  ): Promise<TenantBranding> {
    const [logoUrl, upiQrUrl] = await Promise.all([
      row.logoKey
        ? this.storage.presignDownload(row.logoKey).then((r) => r.downloadUrl)
        : null,
      row.upiQrKey
        ? this.storage.presignDownload(row.upiQrKey).then((r) => r.downloadUrl)
        : null,
    ]);
    return {
      name: row.name,
      slug: row.slug,
      logoUrl,
      accentColor: row.accentColor,
      upiQrUrl,
    };
  }

  /** Manager: update their own PG's branding (scoped to the JWT tenant id). */
  async updateOwn(input: UpdateBrandingInput): Promise<TenantBranding> {
    const tenantId = this.ctx.currentTenantId()!;
    const patch: Partial<typeof tenants.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.logoKey !== undefined) patch.logoKey = input.logoKey;
    if (input.accentColor !== undefined) patch.accentColor = input.accentColor;
    if (input.upiQrKey !== undefined) patch.upiQrKey = input.upiQrKey;

    const [row] = await this.ctx
      .db()
      .update(tenants)
      .set(patch)
      .where(eq(tenants.id, tenantId)) // explicit: tenants has no RLS
      .returning();
    if (!row) throw new NotFoundException("PG not found");
    return this.toBranding(row);
  }

  /**
   * Manager: is this PG code (slug) free to take? Free if no PG holds it, or the
   * holder is the caller's own PG (so re-checking your current code reads as
   * available). Leaks strictly less than the already-public `GET /branding/:slug`.
   */
  async checkSlugAvailable(slug: string): Promise<SlugAvailability> {
    const tenantId = this.ctx.currentTenantId()!;
    const row = await this.appDb.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    return { available: !row || row.id === tenantId };
  }

  /**
   * Manager: change their own PG code (slug). Pre-checks for a clean 409 (the
   * `tenants.slug` unique index is the concurrency backstop); scopes the write to
   * the JWT tenant id (tenants has no RLS). Existing residents keep their session
   * but must use the new code on their next login.
   */
  async updateSlug(slug: string): Promise<TenantBranding> {
    const tenantId = this.ctx.currentTenantId()!;
    const clash = await this.appDb.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    if (clash && clash.id !== tenantId) {
      throw new ConflictException(`PG code '${slug}' is already taken`);
    }
    const [row] = await this.ctx
      .db()
      .update(tenants)
      .set({ slug })
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

  /** Manager: presigned URL to upload a UPI QR code image (tenant-namespaced key). */
  async requestUpiQrUploadUrl(
    contentType: string,
  ): Promise<PresignedUploadResult> {
    assertAllowedType("upi_qr", contentType);
    return this.storage.presignUpload({
      tenantId: this.ctx.currentTenantId()!,
      kind: "upi_qr",
      contentType,
    });
  }

  /** Resident: presigned URL for the tenant's UPI QR code, or null if not configured. */
  async getPaymentInfo(): Promise<PaymentInfo> {
    const tenantId = this.ctx.currentTenantId()!;
    const [row] = await this.ctx
      .db()
      .select({ upiQrKey: tenants.upiQrKey })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!row) throw new NotFoundException("PG not found");
    const upiQrUrl = row.upiQrKey
      ? (await this.storage.presignDownload(row.upiQrKey)).downloadUrl
      : null;
    return { upiQrUrl };
  }
}
