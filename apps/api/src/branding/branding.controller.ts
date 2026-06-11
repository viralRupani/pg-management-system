import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  type LogoUploadUrlInput,
  type UpdateBrandingInput,
  UserRole,
  logoUploadUrlSchema,
  updateBrandingSchema,
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

  /** Manager: presigned URL to upload a new logo. */
  @Post("tenants/logo-url")
  @Roles(UserRole.PG_MANAGER)
  logoUrl(@Body(new ZodBody(logoUploadUrlSchema)) dto: LogoUploadUrlInput) {
    return this.branding.requestLogoUploadUrl(dto.contentType);
  }
}
