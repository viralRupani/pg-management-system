import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  type GenerateInvoicesInput,
  type JwtPayload,
  UserRole,
  generateInvoicesSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { RentService } from "./rent.service";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly rent: RentService) {}

  @Post("generate")
  @Roles(UserRole.PG_MANAGER)
  generate(
    @Body(new ZodBody(generateInvoicesSchema)) dto: GenerateInvoicesInput,
  ) {
    return this.rent.generateMonthly(dto);
  }

  @Get()
  @Roles(UserRole.PG_MANAGER)
  list() {
    return this.rent.listInvoices();
  }

  @Get("mine")
  @Roles(UserRole.RESIDENT)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.rent.listMyInvoices(user.sub);
  }
}
