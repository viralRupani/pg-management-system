import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  type DeleteInvoiceInput,
  type GenerateInvoicesInput,
  type InvoiceListQuery,
  type InvoiceScheduleInput,
  type JwtPayload,
  UserRole,
  deleteInvoiceSchema,
  generateInvoicesSchema,
  invoiceListQuerySchema,
  invoiceScheduleInputSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
import { RentService } from "./rent.service";
import { InvoiceScheduleService } from "./invoice-schedule.service";

@Controller("invoices")
export class InvoicesController {
  constructor(
    private readonly rent: RentService,
    private readonly schedule: InvoiceScheduleService,
  ) {}

  @Post("generate")
  @Roles(UserRole.PG_MANAGER)
  generate(
    @Body(new ZodBody(generateInvoicesSchema)) dto: GenerateInvoicesInput,
  ) {
    return this.rent.generateMonthly(dto);
  }

  // --- Automatic-generation schedule (one per PG; create/edit/delete) ---

  @Get("schedule")
  @Roles(UserRole.PG_MANAGER)
  getSchedule() {
    return this.schedule.getSchedule();
  }

  @Put("schedule")
  @Roles(UserRole.PG_MANAGER)
  setSchedule(
    @Body(new ZodBody(invoiceScheduleInputSchema)) dto: InvoiceScheduleInput,
  ) {
    return this.schedule.upsertSchedule(dto);
  }

  @Delete("schedule")
  @Roles(UserRole.PG_MANAGER)
  deleteSchedule() {
    return this.schedule.deleteSchedule();
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
