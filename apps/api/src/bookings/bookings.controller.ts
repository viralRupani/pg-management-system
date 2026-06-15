import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type CreateBookingInput,
  type JwtPayload,
  UserRole,
  createBookingSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { BookingsService } from "./bookings.service";

/**
 * Manager-facing future-dated bed bookings. The actor (createdByUserId) is read
 * from the JWT `sub`, never the body. Activation is automatic via the daily job;
 * there is no manual confirm endpoint.
 */
@Controller("bookings")
@Roles(UserRole.PG_MANAGER)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  create(
    @Body(new ZodBody(createBookingSchema)) dto: CreateBookingInput,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bookings.create(dto, user.sub);
  }

  @Get()
  list() {
    return this.bookings.list();
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.bookings.cancel(id);
  }
}
