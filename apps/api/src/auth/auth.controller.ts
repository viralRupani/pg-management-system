import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
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

/**
 * Auth surface. Every route is @Public (no token needed), so it's exposed to the
 * internet unauthenticated — hence per-route rate limits (ThrottlerGuard, keyed
 * by client IP) on the brute-forceable ones: password guessing on login and
 * OTP-send abuse / SMS-bombing on otp/request. OTP verify is also throttled as
 * defense-in-depth on top of OtpService's per-code 5-attempt burn. Refresh is a
 * signed-JWT exchange (not brute-forceable) and legitimately frequent, so it's
 * left unthrottled. Limits are no-ops under NODE_ENV=test (see AuthModule).
 */
@UseGuards(ThrottlerGuard)
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("manager/login")
  managerLogin(@Body(new ZodBody(managerLoginSchema)) dto: ManagerLoginInput) {
    return this.auth.managerLogin(dto);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post("resident/otp/request")
  requestOtp(@Body(new ZodBody(otpRequestSchema)) dto: OtpRequestInput) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("resident/otp/verify")
  verifyOtp(@Body(new ZodBody(otpVerifySchema)) dto: OtpVerifyInput) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @SkipThrottle()
  @Post("refresh")
  refresh(@Body(new ZodBody(refreshTokenSchema)) dto: RefreshTokenInput) {
    return this.auth.refresh(dto.refreshToken);
  }
}
