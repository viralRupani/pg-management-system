import { Injectable, Logger } from "@nestjs/common";

/**
 * Outbound email channel. The abstraction is the point: today only a console
 * stub exists, but a real SES/SendGrid driver swaps in later without touching
 * call sites (AuthService). Mirrors the SmsProvider / NotificationChannel seams.
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
