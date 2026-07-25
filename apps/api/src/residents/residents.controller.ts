import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  registerResidentSchema,
  residentListQuerySchema,
  updateResidentEmailSchema,
  verifyEmailOtpSchema,
  type JwtPayload,
  type RegisterResidentInput,
  type ResidentListQuery,
  type UpdateResidentEmailInput,
  type VerifyEmailOtpInput,
  UserRole,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody, ZodQuery } from "../common/zod-validation.pipe";
import { ResidentsService } from "./residents.service";
import { EmailVerificationService } from "./email-verification.service";

@Controller("residents")
@Roles(UserRole.PG_MANAGER)
export class ResidentsController {
  constructor(
    private readonly residents: ResidentsService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Post()
  register(
    @Body(new ZodBody(registerResidentSchema)) dto: RegisterResidentInput,
    @CurrentUser() user: JwtPayload,
  ) {
    // Provenance comes from the JWT actor, never the request body.
    return this.residents.register(dto, user.sub);
  }

  @Get()
  list(@Query(new ZodQuery(residentListQuerySchema)) query: ResidentListQuery) {
    return this.residents.list(query);
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.residents.getById(id);
  }

  /** Correct/add a resident's email; resets verification so it can be re-verified. */
  @Patch(":id/email")
  updateEmail(
    @Param("id") id: string,
    @Body(new ZodBody(updateResidentEmailSchema)) dto: UpdateResidentEmailInput,
  ) {
    return this.residents.updateEmail(id, dto.email);
  }

  /**
   * Email a verification OTP to the resident. Throttled (per IP+route) to stop a
   * manager (or a compromised session) email-bombing a resident's inbox.
   */
  @Post(":id/email/verify/request")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestEmailOtp(@Param("id") id: string) {
    return this.emailVerification.requestOtp(id);
  }

  /** Verify the resident's email with the code the manager entered. */
  @Post(":id/email/verify")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyEmail(
    @Param("id") id: string,
    @Body(new ZodBody(verifyEmailOtpSchema)) dto: VerifyEmailOtpInput,
  ) {
    return this.emailVerification.verifyOtp(id, dto.code);
  }
}
