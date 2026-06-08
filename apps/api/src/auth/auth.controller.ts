import { Body, Controller, Post } from "@nestjs/common";
import {
  managerLoginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshTokenSchema,
  type ManagerLoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RefreshTokenInput,
} from "@pg/shared";
import { Public } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("manager/login")
  managerLogin(@Body(new ZodBody(managerLoginSchema)) dto: ManagerLoginInput) {
    return this.auth.managerLogin(dto);
  }

  @Public()
  @Post("resident/otp/request")
  requestOtp(@Body(new ZodBody(otpRequestSchema)) dto: OtpRequestInput) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Post("resident/otp/verify")
  verifyOtp(@Body(new ZodBody(otpVerifySchema)) dto: OtpVerifyInput) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @Post("refresh")
  refresh(@Body(new ZodBody(refreshTokenSchema)) dto: RefreshTokenInput) {
    return this.auth.refresh(dto.refreshToken);
  }
}
