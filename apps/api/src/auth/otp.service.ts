import { randomInt } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { ENV, type AppEnv } from "../config/env";

/** Pluggable SMS sender. Console stub for local dev; swap MSG91/Twilio later. */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/**
 * Resident phone-OTP using Redis with a TTL. Codes are namespaced by tenant
 * because phone is unique only within a PG. A 6-digit code (10^6 space) is only
 * safe with a guess cap: after MAX_VERIFY_ATTEMPTS wrong tries the code is burned
 * so an attacker can't brute-force it within the TTL.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  private key(tenantId: string, phone: string): string {
    return `otp:${tenantId}:${phone}`;
  }

  private attemptsKey(tenantId: string, phone: string): string {
    return `otp_attempts:${tenantId}:${phone}`;
  }

  async issue(tenantId: string, phone: string): Promise<void> {
    // Dev override: a fixed code (env-gated, force-cleared in prod) lets the
    // mobile app log in without reading Redis/logs. Otherwise a CSPRNG code —
    // not Math.random (predictable). randomInt's upper bound is exclusive, so
    // [100000, 1000000) is always 6 digits.
    const code =
      this.env.OTP_DEV_FIXED_CODE ?? String(randomInt(100000, 1000000));
    // New code resets the failed-attempt counter for this phone.
    await this.redis
      .multi()
      .set(this.key(tenantId, phone), code, "EX", this.env.OTP_TTL_SECONDS)
      .del(this.attemptsKey(tenantId, phone))
      .exec();
    // Dev: log the code. Production: send via SmsProvider.
    if (this.env.OTP_DEV_LOG) {
      this.logger.log(`OTP for ${phone} @ tenant ${tenantId}: ${code}`);
    }
  }

  async verify(
    tenantId: string,
    phone: string,
    code: string,
  ): Promise<boolean> {
    const key = this.key(tenantId, phone);
    const stored = await this.redis.get(key);
    if (!stored) return false;

    if (stored === code) {
      await this.redis.del(key, this.attemptsKey(tenantId, phone));
      return true;
    }

    // Wrong code: count the attempt and burn the code once the cap is hit, so
    // the remaining guesses can't be spent. The counter ages out with the code.
    const attemptsKey = this.attemptsKey(tenantId, phone);
    const attempts = await this.redis.incr(attemptsKey);
    if (attempts === 1)
      await this.redis.expire(attemptsKey, this.env.OTP_TTL_SECONDS);
    if (attempts >= this.MAX_VERIFY_ATTEMPTS) await this.redis.del(key);
    return false;
  }
}
