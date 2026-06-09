import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  type AnnouncementListQuery,
  type CreateAnnouncementInput,
  type JwtPayload,
  UserRole,
  announcementListQuerySchema,
  createAnnouncementSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
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

  /** Anyone in the tenant: the announcement feed (filtered to the actor). */
  @Get()
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodQuery(announcementListQuerySchema)) query: AnnouncementListQuery,
  ) {
    return this.announcements.list(user.sub, user.role, query);
  }
}
