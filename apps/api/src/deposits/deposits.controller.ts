import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  type ApplyDepositToInvoiceInput,
  type ExitRequestInput,
  type ExitSettlementInput,
  type JwtPayload,
  type RecordDepositInput,
  type UpdateDepositAmountInput,
  UserRole,
  applyDepositToInvoiceSchema,
  exitRequestSchema,
  exitSettlementSchema,
  recordDepositSchema,
  updateDepositAmountSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { DepositsService } from "./deposits.service";

@Controller("deposits")
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  // --- Resident ---
  @Get("mine")
  @Roles(UserRole.RESIDENT)
  mine(@CurrentUser() user: JwtPayload) {
    return this.deposits.getForResident(user.sub);
  }

  @Post("exit-request")
  @Roles(UserRole.RESIDENT)
  exitRequest(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(exitRequestSchema)) dto: ExitRequestInput,
  ) {
    return this.deposits.requestExit(user.sub, dto);
  }

  // --- Manager ---
  @Post()
  @Roles(UserRole.PG_MANAGER)
  record(@Body(new ZodBody(recordDepositSchema)) dto: RecordDepositInput) {
    return this.deposits.record(dto);
  }

  @Patch("amount")
  @Roles(UserRole.PG_MANAGER)
  updateAmount(
    @Body(new ZodBody(updateDepositAmountSchema)) dto: UpdateDepositAmountInput,
  ) {
    return this.deposits.updateAmount(dto);
  }

  @Get()
  @Roles(UserRole.PG_MANAGER)
  listAll() {
    return this.deposits.listAll();
  }

  @Get("resident/:residentId")
  @Roles(UserRole.PG_MANAGER)
  byResident(@Param("residentId") residentId: string) {
    return this.deposits.getForResident(residentId);
  }

  @Post("exit")
  @Roles(UserRole.PG_MANAGER)
  exit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(exitSettlementSchema)) dto: ExitSettlementInput,
  ) {
    return this.deposits.settleExit(dto, user.sub);
  }

  @Post("apply-to-invoice")
  @Roles(UserRole.PG_MANAGER)
  applyToInvoice(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(applyDepositToInvoiceSchema))
    dto: ApplyDepositToInvoiceInput,
  ) {
    return this.deposits.applyToInvoice(dto.invoiceId, user.sub);
  }
}
