import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { OtpService } from "./otp.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
