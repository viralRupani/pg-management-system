import { Injectable, Logger } from "@nestjs/common";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Outbound push channel. The abstraction is the point: today only an in-app /
 * Expo-push stub exists, but WhatsApp/SMS/email can be added later without
 * touching call sites (NotificationsService). Mirrors the SmsProvider seam.
 */
export interface NotificationChannel {
  send(tokens: string[], payload: PushPayload): Promise<void>;
}

export const NOTIFICATION_CHANNEL = Symbol("NOTIFICATION_CHANNEL");

/** Dev stub: logs instead of calling the real Expo push API. */
@Injectable()
export class ExpoPushStubChannel implements NotificationChannel {
  private readonly logger = new Logger(ExpoPushStubChannel.name);

  async send(tokens: string[], payload: PushPayload): Promise<void> {
    if (tokens.length === 0) return;
    this.logger.log(
      `[push stub] -> ${tokens.length} device(s): ${payload.title} — ${payload.body}`,
    );
  }
}
