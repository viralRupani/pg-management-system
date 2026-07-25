import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { NotificationSummary } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { notifications, pushTokens, users } from "../db/schema";
import { MailService } from "../mail/mail.service";
import {
  NOTIFICATION_CHANNEL,
  type NotificationChannel,
} from "./notification-channel";

/**
 * Writes the per-user feed AND dispatches a push, behind one call. Must run
 * inside a tenant context (the job wraps each tenant in TenantContextService.run
 * before calling notify). Resident-facing reads filter by user_id = sub, because
 * RLS isolates tenants, not users within a tenant.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly ctx: TenantContextService,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    private readonly mail: MailService,
  ) {}

  /** Feed row + push fan-out + email fallback to the user's verified email. */
  async notify(
    userId: string,
    n: { type: string; title: string; body: string },
  ): Promise<void> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    await db.insert(notifications).values({
      tenantId,
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
    });

    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));
    await this.channel.send(
      tokens.map((t) => t.token),
      { title: n.title, body: n.body, data: { type: n.type } },
    );

    // Interim delivery channel (until real push infra): also email the resident,
    // but only to a VERIFIED address (an unverified one may be a typo). Strictly
    // best-effort — a mail failure must never fail the notification write.
    const [recipient] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (recipient?.email && recipient.emailVerified) {
      try {
        await this.mail.sendNotificationEmail(recipient.email, {
          title: n.title,
          body: n.body,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to email notification to user ${userId}: ${String(err)}`,
        );
      }
    }
  }

  /** Resident registers/refreshes a device token (idempotent per tenant+token). */
  async registerToken(
    userId: string,
    token: string,
    platform?: string,
  ): Promise<{ ok: true }> {
    await this.ctx
      .db()
      .insert(pushTokens)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        userId,
        token,
        platform: platform ?? null,
      })
      .onConflictDoNothing({
        target: [pushTokens.tenantId, pushTokens.token],
      });
    return { ok: true };
  }

  /** Resident: their own feed, newest first. */
  async list(userId: string): Promise<NotificationSummary[]> {
    const rows = await this.ctx
      .db()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Resident: mark one of THEIR notifications read. */
  async markRead(userId: string, id: string): Promise<{ ok: true }> {
    const [row] = await this.ctx
      .db()
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });
    if (!row) throw new NotFoundException("Notification not found");
    return { ok: true };
  }
}
