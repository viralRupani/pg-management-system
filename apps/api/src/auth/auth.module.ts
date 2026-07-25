import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { throttlerRootConfig } from "../common/throttler.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { OtpService } from "./otp.service";
import { PasswordResetService } from "./password-reset.service";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    MailModule,
    // Rate limiting for the auth surface (brute-force / SMS-bombing defense).
    // Applied per-route on AuthController via ThrottlerGuard. Behind a reverse
    // proxy, production must enable Express `trust proxy` so req.ip is the real
    // client, not the proxy (else one shared bucket). See throttlerRootConfig.
    ThrottlerModule.forRootAsync(throttlerRootConfig),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    OtpService,
    PasswordResetService,
  ],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
