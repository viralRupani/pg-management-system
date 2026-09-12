import { randomInt } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { ENV, type AppEnv } from "../config/env";

/**
 * Resident login OTP delivered by email — the replacement for phone/SMS OTP
 * (SMS costs money; see docs/backlog.md and `otp.service.ts`, preserved
 * commented-out for a future SMS/WhatsApp revival). Same Redis-with-TTL shape
 * as `OtpService`/`EmailVerificationService`: a 6-digit CSPRNG code burned
 * after MAX_VERIFY_ATTEMPTS wrong tries. Keyed by (tenantId, email) — not
 * residentId — because login happens before we necessarily know which
 * resident the caller is; email is unique only within a tenant (people move
 * between PGs), so the tenant must be resolved first (by `pgCode`).
 *
 * Deliberately uses its own Redis namespace (`email_login_otp:*`), distinct
 * from `EmailVerificationService`'s `email_otp:*` (manager-driven, keyed by
 * residentId) — the two flows have different callers, keys, and lockout
 * counters and must not collide.
 */
@Injectable()
export class EmailLoginOtpService {
  private readonly logger = new Logger(EmailLoginOtpService.name);
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  /** Case/whitespace-insensitive — must match the DB's `lower(email)` index. */
  static normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  private key(tenantId: string, email: string): string {
    return `email_login_otp:${tenantId}:${EmailLoginOtpService.normalize(email)}`;
  }

  private attemptsKey(tenantId: string, email: string): string {
    return `email_login_otp_attempts:${tenantId}:${EmailLoginOtpService.normalize(email)}`;
  }

  async issue(tenantId: string, email: string): Promise<void> {
    // Dev override: a fixed code (env-gated, force-cleared in prod) lets the
    // apps log in without reading Redis/logs/mail. Otherwise a CSPRNG code —
    // not Math.random (predictable). randomInt's upper bound is exclusive, so
    // [100000, 1000000) is always 6 digits.
    const code =
      this.env.OTP_DEV_FIXED_CODE ?? String(randomInt(100000, 1000000));
    // New code resets the failed-attempt counter for this email.
    await this.redis
      .multi()
      .set(this.key(tenantId, email), code, "EX", this.env.EMAIL_OTP_TTL_SECONDS)
      .del(this.attemptsKey(tenantId, email))
      .exec();

    if (this.env.OTP_DEV_LOG) {
      this.logger.log(`Login OTP for ${email} @ tenant ${tenantId}: ${code}`);
    }
  }

  async verify(
    tenantId: string,
    email: string,
    code: string,
  ): Promise<boolean> {
    const key = this.key(tenantId, email);
    const stored = await this.redis.get(key);
    if (!stored) return false;

    if (stored === code) {
      await this.redis.del(key, this.attemptsKey(tenantId, email));
      return true;
    }

    // Wrong code: count the attempt and burn the code once the cap is hit, so
    // the remaining guesses can't be spent. The counter ages out with the code.
    const attemptsKey = this.attemptsKey(tenantId, email);
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1)
      await this.redis.expire(attemptsKey, this.env.EMAIL_OTP_TTL_SECONDS);
    if (attempts >= this.MAX_VERIFY_ATTEMPTS) await this.redis.del(key);
    return false;
  }
}
