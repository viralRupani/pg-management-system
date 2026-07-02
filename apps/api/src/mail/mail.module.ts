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
      // Real SES sends when SES_FROM_EMAIL is configured; otherwise the console
      // stub. Forced to the stub under NODE_ENV=test so the serialized e2e suite
      // never makes a live SES call even if the var leaks into the test env.
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: AppEnv): EmailProvider =>
        env.SES_FROM_EMAIL && env.NODE_ENV !== "test"
          ? new SesEmailProvider(env)
          : new ConsoleEmailStub(),
    },
  ],
  exports: [MailService],
})
export class MailModule {}
