import { Injectable, Logger } from "@nestjs/common";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { AppEnv } from "../config/env";

/** A fully-rendered message ready to hand to a transport. */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Rendered HTML part (primary). */
  html: string;
  /** Plain-text alternative. ALWAYS sent alongside html — a multipart/alternative
   *  message is a major deliverability win (and the only thing text clients see). */
  text: string;
}

/**
 * Outbound email transport. The abstraction is the point: a console stub for
 * dev/CI and a real AWS SES driver for production swap in behind the same
 * interface without touching call sites. Rendering (Handlebars → html/text)
 * lives upstream in MailService, so a transport only ships an already-built
 * {@link EmailMessage}. Mirrors the StorageProvider / NotificationChannel seams.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

/** Dev stub: logs the email instead of sending it. Logs the TEXT part so a dev
 *  still sees the reset link locally without an SES account. */
@Injectable()
export class ConsoleEmailStub implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailStub.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `[email stub] -> ${message.to} — ${message.subject}\n${message.text}`,
    );
  }
}

/**
 * Real driver: AWS SES (SESv2 SendEmail), multipart/alternative (Html + Text).
 * Selected when SES_FROM_EMAIL is set (see MailModule). Reuses the IAM
 * credentials (ACCESS_KEY_ID / SECRET_ACCESS_KEY — the same principal is granted
 * ses:SendEmail) and SES_REGION (falling back to S3_REGION). The From header
 * carries a display name (MAIL_FROM_NAME) — looks professional and nudges
 * deliverability. From address must be a verified SES identity in that region.
 *
 * `send` swallows nothing — the non-enumeration guarantee lives at the call site
 * (AuthService.forgotPassword), which decides a delivery failure must not change
 * the response. Throwing here keeps the abstraction honest for future callers.
 */
export class SesEmailProvider implements EmailProvider {
  private readonly client: SESv2Client;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(env: AppEnv) {
    // RFC 5322 "Display Name <addr>" composite — SESv2 accepts it in
    // FromEmailAddress. Quoting the name keeps it valid if it ever has commas.
    this.from = `"${env.MAIL_FROM_NAME}" <${env.SES_FROM_EMAIL!}>`;
    this.replyTo = env.MAIL_REPLY_TO;
    this.client = new SESv2Client({
      region: env.SES_REGION,
      credentials: {
        accessKeyId: env.ACCESS_KEY_ID!,
        secretAccessKey: env.SECRET_ACCESS_KEY!,
      },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        ReplyToAddresses: this.replyTo ? [this.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: message.html, Charset: "UTF-8" },
              Text: { Data: message.text, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
  }
}
