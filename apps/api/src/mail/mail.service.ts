import { Inject, Injectable } from "@nestjs/common";
import { ENV, type AppEnv } from "../config/env";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider";
import { MailTemplateService } from "./mail-template.service";

/**
 * Default brand accent for transactional emails. The admin/mobile UIs use
 * per-tenant `var(--brand)` white-labeling, but password-reset runs BEFORE any
 * tenant context exists, so a fixed default is correct here. (Future: thread a
 * tenant brand color through the template `data` once a tenant-scoped email
 * path exists.)
 */
const BRAND_COLOR = "#4f46e5";

/**
 * The application-facing email API: one typed method per email type. Call sites
 * never touch templates or the transport — they call e.g.
 * `sendPasswordResetEmail(...)`. Adding an email = a new template pair + a new
 * method here.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly templates: MailTemplateService,
  ) {}

  /** Password-reset email for the manager/owner forgot-password flow. */
  async sendPasswordResetEmail(
    to: string,
    params: { resetUrl: string; ttlMinutes: number },
  ): Promise<void> {
    const { html, text } = this.templates.render("password-reset", {
      appName: this.env.MAIL_FROM_NAME,
      brandColor: BRAND_COLOR,
      preheader: "Use the link inside to reset your password.",
      resetUrl: params.resetUrl,
      ttlMinutes: params.ttlMinutes,
      year: new Date().getFullYear(),
    });
    await this.provider.send({
      to,
      subject: `Reset your ${this.env.MAIL_FROM_NAME} password`,
      html,
      text,
    });
  }

  /** Email-verification OTP sent to a resident (manager-driven verify flow). */
  async sendOtpEmail(
    to: string,
    params: { code: string; ttlMinutes: number },
  ): Promise<void> {
    const { html, text } = this.templates.render("otp", {
      appName: this.env.MAIL_FROM_NAME,
      brandColor: BRAND_COLOR,
      preheader: `Your ${this.env.MAIL_FROM_NAME} verification code is ${params.code}.`,
      code: params.code,
      ttlMinutes: params.ttlMinutes,
      year: new Date().getFullYear(),
    });
    await this.provider.send({
      to,
      subject: `Your ${this.env.MAIL_FROM_NAME} verification code`,
      html,
      text,
    });
  }

  /**
   * Generic resident notification email — the interim delivery channel for the
   * in-app notifications feed (rent, payments, announcements) until real push
   * infra lands. Mirrors the title/body of the feed row.
   */
  async sendNotificationEmail(
    to: string,
    params: { title: string; body: string },
  ): Promise<void> {
    const { html, text } = this.templates.render("notification", {
      appName: this.env.MAIL_FROM_NAME,
      brandColor: BRAND_COLOR,
      preheader: params.title,
      title: params.title,
      body: params.body,
      year: new Date().getFullYear(),
    });
    await this.provider.send({
      to,
      subject: params.title,
      html,
      text,
    });
  }
}
