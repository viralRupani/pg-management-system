import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { jwtPayloadSchema } from "@pg/shared";
import { IS_PUBLIC } from "./decorators";

/**
 * Verifies the access token and attaches the validated payload to
 * `request.auth`. The tenant id used for RLS comes from here and ONLY here —
 * never from request body/query/header.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();

    let raw: unknown;
    try {
      raw = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    const parsed = jwtPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new UnauthorizedException("Malformed token payload");
    }
    req.auth = parsed.data;
    return true;
  }
}
