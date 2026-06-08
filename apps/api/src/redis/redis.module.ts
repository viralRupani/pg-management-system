import {
  Global,
  Inject,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import Redis from "ioredis";
import { ENV, type AppEnv } from "../config/env";

export const REDIS = Symbol("REDIS");

/** Global Redis client — OTP storage now, BullMQ job queues later. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: AppEnv) =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
