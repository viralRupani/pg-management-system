import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { throttlerRootConfig } from "../common/throttler.config";
import { MailModule } from "../mail/mail.module";
import { ResidentsController } from "./residents.controller";
import { ResidentsService } from "./residents.service";
import { EmailVerificationService } from "./email-verification.service";

@Module({
  imports: [
    MailModule,
    // Supplies the ThrottlerGuard providers for the email-verify routes (the
    // ThrottlerModule isn't global). Same config as AuthModule.
    ThrottlerModule.forRootAsync(throttlerRootConfig),
  ],
  controllers: [ResidentsController],
  providers: [ResidentsService, EmailVerificationService],
  exports: [ResidentsService],
})
export class ResidentsModule {}
