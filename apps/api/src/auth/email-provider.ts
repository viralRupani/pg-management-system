import { Injectable, Logger } from "@nestjs/common";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { AppEnv } from "../config/env";

/**
 * Outbound email channel. The abstraction is the point: a console stub for
 * dev/CI and a real AWS SES driver for production swap in behind the same
 * interface without touching call sites (AuthService). Mirrors the
 * StorageProvider / SmsProvider / NotificationChannel seams.
 */
export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

/** Dev stub: logs the email instead of sending it (e.g. password-reset links). */
@Injectable()
export class ConsoleEmailStub implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailStub.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[email stub] -> ${to} — ${subject}\n${body}`);
  }
}

/**
 * Real driver: AWS SES (SESv2 SendEmail). Selected when SES_FROM_EMAIL is set
 * (see AuthModule). Reuses the S3_* IAM credentials — the same principal is
 * granted ses:SendEmail — and SES_REGION (falling back to S3_REGION, since SES
 * is regional and may differ from the bucket's region). The From address must
 * be a verified SES identity in that region.
 *
 * `send` swallows nothing here — the non-enumeration guarantee lives at the
 * call site (AuthService.forgotPassword), which decides that a delivery failure
 * must not change the response. Throwing here keeps the abstraction honest for
 * any future caller that DOES need to know a send failed.
 */
export class SesEmailProvider implements EmailProvider {
  private readonly client: SESv2Client;
  private readonly from: string;

  constructor(env: AppEnv) {
    this.from = env.SES_FROM_EMAIL!;
    this.client = new SESv2Client({
      region: env.SES_REGION,
      credentials: {
        accessKeyId: env.ACCESS_KEY_ID!,
        secretAccessKey: env.SECRET_ACCESS_KEY!,
      },
    });
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: body, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}
