import { randomInt } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import Redis from "ioredis";
import { and, eq } from "drizzle-orm";
import { UserRole } from "@pg/shared";
import { REDIS } from "../redis/redis.module";
import { ENV, type AppEnv } from "../config/env";
import { TenantContextService } from "../db/tenant-context";
import { users } from "../db/schema";
import { MailService } from "../mail/mail.service";

/**
 * Resident email verification via an emailed OTP (the manager-driven verify
 * flow). Email is the interim resident notification channel until real push
 * infra lands, so a long-term resident's email must be proven deliverable
 * before they can be allocated a bed (the gate lives in AllocationService /
 * BookingsService, keyed off `users.email_verified`).
 *
 * The Redis code pattern mirrors OtpService: a 6-digit CSPRNG code with a TTL,
 * burned after MAX_VERIFY_ATTEMPTS wrong tries so it can't be brute-forced. Keyed
 * by (tenantId, residentId) — the resident id is stable and tenant-namespaced.
 * All DB reads/writes run under the caller's tenant context (RLS).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: AppEnv,
    private readonly ctx: TenantContextService,
    private readonly mail: MailService,
  ) {}

  private key(tenantId: string, residentId: string): string {
    return `email_otp:${tenantId}:${residentId}`;
  }

  private attemptsKey(tenantId: string, residentId: string): string {
    return `email_otp_attempts:${tenantId}:${residentId}`;
  }

  /**
   * Generate + email a verification code to the resident. Throws if the resident
   * can't be verified (not found / short-stay / no email / already verified) so
   * the manager gets a clear reason. A mail send failure propagates (the manager
   * must know delivery failed) — unlike the best-effort notification emails.
   */
  async requestOtp(residentId: string): Promise<{ sent: true }> {
    const tenantId = this.ctx.currentTenantId()!;
    const [resident] = await this.ctx
      .db()
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        isShortStay: users.isShortStay,
      })
      .from(users)
      .where(and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)));

    if (!resident) throw new NotFoundException("Resident not found");
    if (resident.isShortStay)
      throw new ConflictException(
        "Short-stay guests don't require email verification",
      );
    if (!resident.email)
      throw new UnprocessableEntityException(
        "This resident has no email on file",
      );
    if (resident.emailVerified)
      throw new ConflictException("This email is already verified");

    // CSPRNG code — randomInt's upper bound is exclusive, so [100000, 1000000)
    // is always 6 digits. A new code resets the failed-attempt counter.
    const code = String(randomInt(100000, 1000000));
    await this.redis
      .multi()
      .set(
        this.key(tenantId, residentId),
        code,
        "EX",
        this.env.EMAIL_OTP_TTL_SECONDS,
      )
      .del(this.attemptsKey(tenantId, residentId))
      .exec();

    // Dev: log the code so local testing needs no live SES (mirrors OtpService).
    if (this.env.OTP_DEV_LOG) {
      this.logger.log(
        `Email OTP for resident ${residentId} @ tenant ${tenantId} (${resident.email}): ${code}`,
      );
    }

    await this.mail.sendOtpEmail(resident.email, {
      code,
      ttlMinutes: Math.round(this.env.EMAIL_OTP_TTL_SECONDS / 60),
    });
    return { sent: true };
  }

  /**
   * Verify the code the resident received. On success, conditional-flip the
   * resident's email_verified (idempotent-safe: only flips a currently-false
   * row). Throws 400 on a wrong/expired code. Burns the code after the cap.
   */
  async verifyOtp(residentId: string, code: string): Promise<{ verified: true }> {
    const tenantId = this.ctx.currentTenantId()!;

    // Confirm the resident exists in THIS tenant first (RLS hides other tenants'
    // rows) → a clean 404, consistent with requestOtp, rather than leaking the
    // outcome via the code check.
    const [resident] = await this.ctx
      .db()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)))
      .limit(1);
    if (!resident) throw new NotFoundException("Resident not found");

    const key = this.key(tenantId, residentId);
    const attemptsKey = this.attemptsKey(tenantId, residentId);

    const stored = await this.redis.get(key);
    const matched = !!stored && stored === code;

    if (!matched) {
      if (stored) {
        // Wrong code: count the attempt, burn the code once the cap is hit so
        // remaining guesses can't be spent. The counter ages out with the code.
        const attempts = await this.redis.incr(attemptsKey);
        if (attempts === 1)
          await this.redis.expire(attemptsKey, this.env.EMAIL_OTP_TTL_SECONDS);
        if (attempts >= this.MAX_VERIFY_ATTEMPTS) await this.redis.del(key);
      }
      throw new UnprocessableEntityException(
        "That code is incorrect or has expired",
      );
    }

    await this.redis.del(key, attemptsKey);
    await this.ctx
      .db()
      .update(users)
      .set({ emailVerified: true, emailVerifiedAt: new Date() })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          eq(users.emailVerified, false),
        ),
      );
    return { verified: true };
  }
}
