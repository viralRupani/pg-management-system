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
 * because phone is unique only within a PG.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  private key(tenantId: string, phone: string): string {
    return `otp:${tenantId}:${phone}`;
  }

  async issue(tenantId: string, phone: string): Promise<void> {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.set(
      this.key(tenantId, phone),
      code,
      "EX",
      this.env.OTP_TTL_SECONDS,
    );
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
    if (stored && stored === code) {
      await this.redis.del(key);
      return true;
    }
    return false;
  }
}
