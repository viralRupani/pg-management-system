import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  type GenerateInvoicesInput,
  type InvoiceListQuery,
  type JwtPayload,
  UserRole,
  generateInvoicesSchema,
  invoiceListQuerySchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
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
  list(@Query(new ZodQuery(invoiceListQuerySchema)) query: InvoiceListQuery) {
    return this.rent.listInvoices(query);
  }

  @Get("mine")
  @Roles(UserRole.RESIDENT)
  listMine(@CurrentUser() user: JwtPayload) {
    return this.rent.listMyInvoices(user.sub);
  }
}
