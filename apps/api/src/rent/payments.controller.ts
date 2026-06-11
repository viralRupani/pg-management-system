import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  type JwtPayload,
  type PaymentUploadUrlInput,
  PaymentStatus,
  type RejectPaymentInput,
  type SubmitPaymentInput,
  UserRole,
  paymentUploadUrlSchema,
  rejectPaymentSchema,
  submitPaymentSchema,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { RentService } from "./rent.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly rent: RentService) {}

  // --- Resident ---
  @Post("upload-url")
  @Roles(UserRole.RESIDENT)
  uploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(paymentUploadUrlSchema)) dto: PaymentUploadUrlInput,
  ) {
    return this.rent.requestUploadUrl(user.sub, dto.invoiceId, dto.contentType);
  }

  @Post()
  @Roles(UserRole.RESIDENT)
  submit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(submitPaymentSchema)) dto: SubmitPaymentInput,
  ) {
    return this.rent.submitPayment(user.sub, dto);
  }

  // --- Manager ---
  @Get()
  @Roles(UserRole.PG_MANAGER)
  list(@Query("status") status?: string) {
    const valid =
      status && (Object.values(PaymentStatus) as string[]).includes(status)
        ? (status as PaymentStatus)
        : undefined;
    return this.rent.listPayments(valid);
  }

  @Get(":id/screenshot")
  @Roles(UserRole.PG_MANAGER)
  screenshot(@Param("id") id: string) {
    return this.rent.getScreenshotUrl(id);
  }

  @Post(":id/approve")
  @Roles(UserRole.PG_MANAGER)
  approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.rent.approvePayment(id, user.sub);
  }

  @Post(":id/reject")
  @Roles(UserRole.PG_MANAGER)
  reject(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body(new ZodBody(rejectPaymentSchema)) dto: RejectPaymentInput,
  ) {
    return this.rent.rejectPayment(id, user.sub, dto.note);
  }
}
