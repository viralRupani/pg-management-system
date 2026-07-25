import type { ThrottlerAsyncOptions } from "@nestjs/throttler";
import { ENV, type AppEnv } from "../config/env";

/**
 * Shared rate-limit configuration for `ThrottlerModule.forRootAsync`. Supplies
 * in-memory storage + a generous fallback bucket; per-route limits are applied
 * with `@Throttle` on the controllers. Storage is in-memory, so limits are PER
 * API INSTANCE — fine for the current single-instance deploy; swap a Redis
 * throttler storage here when scaling horizontally. Skipped under NODE_ENV=test
 * so the serialized e2e suite (many requests from one IP) isn't throttled.
 *
 * Imported by every module whose controller uses `@UseGuards(ThrottlerGuard)`
 * (AuthModule, ResidentsModule) — the guard resolves its providers from the
 * importing module's context (the ThrottlerModule isn't global).
 */
export const throttlerRootConfig: ThrottlerAsyncOptions = {
  inject: [ENV],
  useFactory: (env: AppEnv) => ({
    throttlers: [{ ttl: 60_000, limit: 10 }],
    skipIf: () => env.NODE_ENV === "test",
  }),
};
