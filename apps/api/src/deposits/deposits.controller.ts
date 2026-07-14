import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  type ApplyDepositToInvoiceInput,
  type CollectDepositInput,
  type ExitDecisionInput,
  type ExitRequestInput,
  type ExitSettlementInput,
  type JwtPayload,
  type RecordDepositInput,
  type RefundDepositInput,
  type UpdateDepositAmountInput,
  UserRole,
  applyDepositToInvoiceSchema,
  collectDepositSchema,
  exitDecisionSchema,
  exitRequestSchema,
  exitSettlementSchema,
  recordDepositSchema,
  refundDepositSchema,
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

  @Post("exit-request/update")
  @Roles(UserRole.RESIDENT)
  updateExitRequest(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(exitRequestSchema)) dto: ExitRequestInput,
  ) {
    return this.deposits.updateExitRequest(user.sub, dto);
  }

  @Post("exit-request/cancel")
  @Roles(UserRole.RESIDENT)
  cancelExitRequest(@CurrentUser() user: JwtPayload) {
    return this.deposits.requestCancelExit(user.sub);
  }

  @Post("exit-request/withdraw")
  @Roles(UserRole.RESIDENT)
  withdrawExitRequest(@CurrentUser() user: JwtPayload) {
    return this.deposits.withdrawExitRequest(user.sub);
  }

  // --- Manager ---
  @Post()
  @Roles(UserRole.PG_MANAGER)
  record(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(recordDepositSchema)) dto: RecordDepositInput,
  ) {
    return this.deposits.record(dto, user.sub);
  }

  @Post("collect")
  @Roles(UserRole.PG_MANAGER)
  collect(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(collectDepositSchema)) dto: CollectDepositInput,
  ) {
    return this.deposits.collect(dto, user.sub);
  }

  @Post("refund")
  @Roles(UserRole.PG_MANAGER)
  refund(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(refundDepositSchema)) dto: RefundDepositInput,
  ) {
    return this.deposits.refund(dto, user.sub);
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

  @Post("exit-request/:residentId/approve")
  @Roles(UserRole.PG_MANAGER)
  approveExitRequest(
    @CurrentUser() user: JwtPayload,
    @Param("residentId") residentId: string,
  ) {
    return this.deposits.approveExitRequest(residentId, user.sub);
  }

  @Post("exit-request/:residentId/reject")
  @Roles(UserRole.PG_MANAGER)
  rejectExitRequest(
    @Param("residentId") residentId: string,
    @Body(new ZodBody(exitDecisionSchema)) dto: ExitDecisionInput,
  ) {
    return this.deposits.rejectExitRequest(residentId, dto);
  }
}
