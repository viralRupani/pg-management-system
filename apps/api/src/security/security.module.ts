import { Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ENV, type AppEnv } from "../config/env";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { TenantContextInterceptor } from "../rls/tenant-context.interceptor";
import { TenantContextService } from "../db/tenant-context";

/**
 * Wires the global security stack. Execution order per request:
 *   1. JwtAuthGuard   — verifies access token, sets req.auth (tenant source).
 *   2. RolesGuard     — enforces @Roles(...).
 *   3. TenantContextInterceptor — opens the RLS transaction for tenant requests.
 * Guards always run before interceptors, so req.auth is set before we read the
 * tenant id. JwtModule here is configured with the ACCESS secret (used for
 * verification); the refresh secret is passed explicitly where needed.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: AppEnv) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL },
      }),
    }),
  ],
  providers: [
    TenantContextService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [JwtModule, TenantContextService],
})
export class SecurityModule {}
