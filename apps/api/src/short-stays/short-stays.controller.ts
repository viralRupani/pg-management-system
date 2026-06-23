import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type CreateShortStayInput,
  type JwtPayload,
  UserRole,
  createShortStaySchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { ShortStaysService } from "./short-stays.service";

@Controller("short-stays")
@Roles(UserRole.PG_MANAGER)
export class ShortStaysController {
  constructor(private readonly shortStays: ShortStaysService) {}

  @Post()
  create(
    @Body(new ZodBody(createShortStaySchema)) dto: CreateShortStayInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.shortStays.create(dto, user.sub);
  }

  @Get()
  list() {
    return this.shortStays.list();
  }

  @Post(":id/complete")
  complete(@Param("id") id: string) {
    return this.shortStays.complete(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.shortStays.cancel(id);
  }
}
