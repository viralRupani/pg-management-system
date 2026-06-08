import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type JwtPayload, UserRole } from "@pg/shared";
import { IS_PUBLIC, ROLES_KEY } from "./decorators";

/**
 * Role hierarchy: a key role implicitly satisfies every role it outranks. A PG
 * owner has all manager capabilities in their PGs (plus owner-only powers), so
 * PG_OWNER satisfies any @Roles(PG_MANAGER) gate — one central rule rather than
 * broadening every manager controller. Owner-only routes still gate on
 * @Roles(PG_OWNER), which a manager does not satisfy (the relation is one-way).
 */
const OUTRANKS: Partial<Record<UserRole, readonly UserRole[]>> = {
  [UserRole.PG_OWNER]: [UserRole.PG_MANAGER],
};

/** Enforces @Roles(...) against the authenticated payload set by JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.auth as JwtPayload | undefined;
    const satisfies =
      auth != null &&
      required.some(
        (r) => auth.role === r || OUTRANKS[auth.role]?.includes(r),
      );
    if (!satisfies) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
