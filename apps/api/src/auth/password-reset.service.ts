import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS } from "../redis/redis.module";
import { ENV, type AppEnv } from "../config/env";

/**
 * Single-use password-reset tokens in Redis with a TTL. A token is an opaque
 * CSPRNG string mapped to the auth_identities row it resets. NOT a JWT — we want
 * it revocable and one-shot: `consume` does an atomic GETDEL so a token can be
 * spent exactly once, and the entry self-expires after PWRESET_TTL_SECONDS.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  private key(token: string): string {
    return `pwreset:${token}`;
  }

  private emailKey(email: string): string {
    return `pwreset:email:${email.toLowerCase()}`;
  }

  /**
   * Mint a reset token bound to an identity id; returns the raw token.
   * Also stores a reverse email→token mapping (same TTL) so tests/tooling can
   * look up the token by the email that triggered the reset.
   */
  async issue(identityId: string, email: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.redis
      .multi()
      .set(this.key(token), identityId, "EX", this.env.PWRESET_TTL_SECONDS)
      .set(this.emailKey(email), token, "EX", this.env.PWRESET_TTL_SECONDS)
      .exec();
    return token;
  }

  /** Look up the most-recently-issued token for an email (null if none/expired). */
  getTokenForEmail(email: string): Promise<string | null> {
    return this.redis.get(this.emailKey(email));
  }

  /** Spend a token: returns the identity id and deletes it, or null if invalid. */
  async consume(token: string): Promise<string | null> {
    return this.redis.getdel(this.key(token));
  }
}
