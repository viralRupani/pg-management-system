import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ENV, type AppEnv } from "../config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { OtpService } from "./otp.service";

@Module({
  imports: [
    // Rate limiting for the auth surface (brute-force / SMS-bombing defense).
    // Applied per-route on AuthController via ThrottlerGuard; this just supplies
    // the storage + a generous fallback bucket. Storage is in-memory, so limits
    // are PER API INSTANCE — fine for the current single-instance deploy; swap a
    // Redis throttler storage in here when scaling horizontally. Skipped under
    // NODE_ENV=test so the serialized e2e suite (many logins from one IP) isn't
    // throttled. Behind a reverse proxy, production must enable Express `trust
    // proxy` so req.ip is the real client, not the proxy (else one shared bucket).
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: AppEnv) => ({
        throttlers: [{ ttl: 60_000, limit: 10 }],
        skipIf: () => env.NODE_ENV === "test",
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
