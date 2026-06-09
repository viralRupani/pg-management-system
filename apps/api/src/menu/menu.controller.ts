import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  type UpdateMenuConfigInput,
  type UpsertMenuSlotInput,
  MealType,
  UserRole,
  updateMenuConfigSchema,
  upsertMenuSlotSchema,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { MenuService } from "./menu.service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Menu controller. Sub-routes (/config, /slots) are declared BEFORE the bare
 * @Get() so NestJS's Express router matches them first.
 */
@Controller("menu")
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /** Anyone in the tenant: get (or auto-init) the cycle config. */
  @Get("config")
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  getConfig() {
    return this.menu.getConfig();
  }

  /** Manager: update cycle length and/or anchor Monday. */
  @Patch("config")
  @Roles(UserRole.PG_MANAGER)
  updateConfig(
    @Body(new ZodBody(updateMenuConfigSchema)) dto: UpdateMenuConfigInput,
  ) {
    return this.menu.updateConfig(dto);
  }

  /** Anyone in the tenant: list all template slots. */
  @Get("slots")
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  listSlots() {
    return this.menu.listSlots();
  }

  /** Manager: upsert a template slot. */
  @Post("slots")
  @Roles(UserRole.PG_MANAGER)
  upsertSlot(@Body(new ZodBody(upsertMenuSlotSchema)) dto: UpsertMenuSlotInput) {
    return this.menu.upsertSlot(dto);
  }

  /**
   * Manager: delete a template slot by its natural composite key.
   * Path params are strings — parse weekNumber and dayOfWeek to int manually
   * (no ParseIntPipe used in this codebase).
   */
  @Delete("slots/:weekNumber/:dayOfWeek/:mealType")
  @HttpCode(204)
  @Roles(UserRole.PG_MANAGER)
  deleteSlot(
    @Param("weekNumber") weekNumberStr: string,
    @Param("dayOfWeek") dayOfWeekStr: string,
    @Param("mealType") mealTypeStr: string,
  ) {
    const weekNumber = parseInt(weekNumberStr, 10);
    const dayOfWeek = parseInt(dayOfWeekStr, 10);
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 3) {
      throw new BadRequestException("weekNumber must be 1, 2, or 3");
    }
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      throw new BadRequestException("dayOfWeek must be 1–7");
    }
    const validMeals = Object.values(MealType) as string[];
    if (!validMeals.includes(mealTypeStr)) {
      throw new BadRequestException(
        `mealType must be one of ${validMeals.join(", ")}`,
      );
    }
    return this.menu.deleteSlot(weekNumber, dayOfWeek, mealTypeStr);
  }

  /**
   * Anyone in the tenant: materialized menu for an inclusive [from, to] range.
   * Same URL and response shape as the old per-date endpoint — no client change.
   */
  @Get()
  @Roles(UserRole.PG_MANAGER, UserRole.RESIDENT)
  list(@Query("from") from?: string, @Query("to") to?: string) {
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new BadRequestException(
        "from and to are required 'YYYY-MM-DD' dates",
      );
    }
    return this.menu.listForDateRange(from, to);
  }
}
