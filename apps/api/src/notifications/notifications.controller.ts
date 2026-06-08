import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type JwtPayload,
  type RegisterPushTokenInput,
  UserRole,
  registerPushTokenSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@Roles(UserRole.RESIDENT)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("push-token")
  registerToken(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(registerPushTokenSchema)) dto: RegisterPushTokenInput,
  ) {
    return this.notifications.registerToken(user.sub, dto.token, dto.platform);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.notifications.list(user.sub);
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.notifications.markRead(user.sub, id);
  }
}
