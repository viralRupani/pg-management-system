import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload, UserRole } from "@pg/shared";
import { IS_PUBLIC, ROLES_KEY } from "./decorators";

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
    if (!auth || !required.includes(auth.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
