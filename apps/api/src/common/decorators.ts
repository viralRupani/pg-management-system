import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { JwtPayload } from "@pg/shared";
import type { UserRole } from "@pg/shared";

/** Marks a route as public — JwtAuthGuard will skip it. */
export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the given roles (enforced by RolesGuard). */
export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated JWT payload (set on the request by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.auth as JwtPayload;
  },
);
