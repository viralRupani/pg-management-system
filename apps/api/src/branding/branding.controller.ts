import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  type LogoUploadUrlInput,
  type UpdateBrandingInput,
  type UpdateSlugInput,
  type UpiQrUploadUrlInput,
  UserRole,
  logoUploadUrlSchema,
  updateBrandingSchema,
  updateSlugSchema,
  upiQrUploadUrlSchema,
} from "@pg/shared";
import { Public, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { BrandingService } from "./branding.service";

/**
 * White-labeling endpoints. The by-slug read is PUBLIC (the login screen needs
 * branding before auth); the rest are manager self-service for the caller's own
 * PG. No tenant-list route exists, so one PG can't enumerate the others.
 */
@Controller()
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** PUBLIC: branding for the login screen. */
  @Public()
  @Get("branding/:slug")
  bySlug(@Param("slug") slug: string) {
    return this.branding.getBySlug(slug);
  }

  /** Manager: own PG branding. */
  @Get("tenants/branding")
  @Roles(UserRole.PG_MANAGER)
  mine() {
    return this.branding.getOwn();
  }

  /** Manager: update own PG branding. */
  @Patch("tenants/branding")
  @Roles(UserRole.PG_MANAGER)
  update(
    @Body(new ZodBody(updateBrandingSchema)) dto: UpdateBrandingInput,
  ) {
    return this.branding.updateOwn(dto);
  }

  /** Manager: is a PG code (slug) free to take? (Their own current code reads as free.) */
  @Get("tenants/slug-available/:slug")
  @Roles(UserRole.PG_MANAGER)
  slugAvailable(@Param("slug") slug: string) {
    return this.branding.checkSlugAvailable(slug);
  }

  /** Manager: change own PG code (slug) — the code residents use to log in. */
  @Patch("tenants/slug")
  @Roles(UserRole.PG_MANAGER)
  updateSlug(@Body(new ZodBody(updateSlugSchema)) dto: UpdateSlugInput) {
    return this.branding.updateSlug(dto.slug);
  }

  /** Manager: presigned URL to upload a new logo. */
  @Post("tenants/logo-url")
  @Roles(UserRole.PG_MANAGER)
  logoUrl(@Body(new ZodBody(logoUploadUrlSchema)) dto: LogoUploadUrlInput) {
    return this.branding.requestLogoUploadUrl(dto.contentType);
  }

  /** Manager: presigned URL to upload a UPI QR code image. */
  @Post("tenants/upi-qr-url")
  @Roles(UserRole.PG_MANAGER)
  upiQrUrl(@Body(new ZodBody(upiQrUploadUrlSchema)) dto: UpiQrUploadUrlInput) {
    return this.branding.requestUpiQrUploadUrl(dto.contentType);
  }

  /** Resident: UPI QR URL for their tenant (null if manager hasn't configured one). */
  @Get("tenant/payment-info")
  @Roles(UserRole.RESIDENT)
  paymentInfo() {
    return this.branding.getPaymentInfo();
  }
}
