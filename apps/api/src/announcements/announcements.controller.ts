import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  type CreateAnnouncementInput,
  type JwtPayload,
  UserRole,
  createAnnouncementSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { AnnouncementsService } from "./announcements.service";

@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /** Manager: post a new announcement. */
  @Post()
  @Roles(UserRole.PG_MANAGER)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(createAnnouncementSchema)) dto: CreateAnnouncementInput,
  ) {
    return this.announcements.create(user.sub, dto);
  }

  /** Anyone in the tenant: the announcement feed. */
  @Get()
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  list() {
    return this.announcements.list();
  }
}
