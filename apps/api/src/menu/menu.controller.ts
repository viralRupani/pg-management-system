import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";
import {
  type UpsertMenuInput,
  UserRole,
  upsertMenuSchema,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { MenuService } from "./menu.service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller("menu")
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /** Manager: publish/replace a date+meal menu. */
  @Post()
  @Roles(UserRole.PG_MANAGER)
  upsert(@Body(new ZodBody(upsertMenuSchema)) dto: UpsertMenuInput) {
    return this.menu.upsert(dto);
  }

  /** Anyone in the tenant: menu for an inclusive [from, to] date range. */
  @Get()
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  list(@Query("from") from?: string, @Query("to") to?: string) {
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new BadRequestException(
        "from and to are required 'YYYY-MM-DD' dates",
      );
    }
    return this.menu.list(from, to);
  }
}
