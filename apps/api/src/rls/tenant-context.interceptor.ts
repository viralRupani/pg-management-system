import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from, lastValueFrom } from "rxjs";
import type { JwtPayload } from "@pg/shared";
import { UserRole } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";

/**
 * Wraps every tenant-scoped request in a transaction that pins the tenant id to
 * the connection via `SET LOCAL`, then runs the handler inside that transaction
 * and ALS scope. A thrown error rolls back; success commits before responding.
 *
 * Skipped when there is no tenant context:
 *   - public/unauthenticated routes (no req.auth)
 *   - PLATFORM_ADMIN (tenantId === null) — the platform module uses the
 *     BYPASSRLS pool directly and must NOT be wrapped in a tenant transaction.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.auth as JwtPayload | undefined;

    const isTenantScoped =
      auth != null &&
      auth.role !== UserRole.PLATFORM_ADMIN &&
      auth.tenantId != null;

    if (!isTenantScoped) {
      return next.handle();
    }

    return from(
      this.tenantContext.run(auth!.tenantId as string, () =>
        lastValueFrom(next.handle()),
      ),
    );
  }
}
