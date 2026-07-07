import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  type JwtPayload,
  type PublishTcInput,
  type TcAcceptInput,
  UserRole,
  publishTcInputSchema,
  tcAcceptInputSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { TermsService } from "./terms.service";

/**
 * Terms & Conditions surface. Mixed method-level roles (like InvoicesController):
 * owners/managers only ACCEPT + read their status; the platform super-admin
 * PUBLISHES + lists versions. RolesGuard gives a direct PLATFORM_ADMIN token an
 * exact match on @Roles(PLATFORM_ADMIN); PG_OWNER only outranks PG_MANAGER, so an
 * owner cannot publish.
 */
@Controller("terms")
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  /** The caller's acceptance status for the latest version. Fails open. */
  @Get("status")
  @Roles(UserRole.PG_OWNER, UserRole.PG_MANAGER)
  status(@CurrentUser() user: JwtPayload) {
    return this.terms.getStatus(user);
  }

  /** Record acceptance of the current latest version (idempotent). */
  @Post("accept")
  @Roles(UserRole.PG_OWNER, UserRole.PG_MANAGER)
  accept(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(tcAcceptInputSchema)) dto: TcAcceptInput,
  ) {
    return this.terms.accept(user, dto.version);
  }

  /** Platform admin: all published versions, newest first. */
  @Get("versions")
  @Roles(UserRole.PLATFORM_ADMIN)
  listVersions() {
    return this.terms.listVersions();
  }

  /** Platform admin: publish a new version (supersedes prior acceptances). */
  @Post("versions")
  @Roles(UserRole.PLATFORM_ADMIN)
  publish(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(publishTcInputSchema)) dto: PublishTcInput,
  ) {
    return this.terms.publish(user, dto.body);
  }
}
