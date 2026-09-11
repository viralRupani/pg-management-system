import { Module } from "@nestjs/common";
import { ENV, type AppEnv } from "../config/env";
import {
  ConsoleEmailStub,
  SesEmailProvider,
  EMAIL_PROVIDER,
  type EmailProvider,
} from "./email-provider";
import { MailTemplateService } from "./mail-template.service";
import { MailService } from "./mail.service";

/**
 * Owns the email seam: template rendering (MailTemplateService), the typed
 * application API (MailService), and the transport selection. Import this module
 * and inject `MailService` wherever email is needed.
 */
@Module({
  providers: [
    MailTemplateService,
    MailService,
    {
      // Real SES sends only in production (and only when SES_FROM_EMAIL is
      // configured there) — every other NODE_ENV (development, test, ...) gets
      // the console stub, even if SES_FROM_EMAIL is set in the local .env from
      // production-setup work. Keeps dev/CI from ever making a live SES call.
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: AppEnv): EmailProvider =>
        env.SES_FROM_EMAIL && env.NODE_ENV === "production"
          ? new SesEmailProvider(env)
          : new ConsoleEmailStub(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
