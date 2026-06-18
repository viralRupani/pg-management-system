import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  type DeleteInvoiceInput,
  type GenerateInvoicesInput,
  type InvoiceListQuery,
  type JwtPayload,
  UserRole,
  deleteInvoiceSchema,
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

  @Post(":id/delete")
  @Roles(UserRole.PG_MANAGER)
  delete(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodBody(deleteInvoiceSchema)) dto: DeleteInvoiceInput,
  ) {
    return this.rent.deleteInvoice(id, user.sub, dto.reason);
  }
}
