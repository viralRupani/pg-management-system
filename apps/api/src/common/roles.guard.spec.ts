import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@pg/shared";
import { IS_PUBLIC, ROLES_KEY } from "./decorators";
import { RolesGuard } from "./roles.guard";

/**
 * The RolesGuard is fail-closed: every route must declare @Public or @Roles, and
 * the role hierarchy (PG_OWNER outranks PG_MANAGER) is one-way. These are pure
 * unit tests — no app/DB — driven by a stubbed Reflector + a fake request.
 */
describe("RolesGuard", () => {
  function makeGuard(meta: {
    isPublic?: boolean;
    roles?: UserRole[];
  }): RolesGuard {
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === IS_PUBLIC ? meta.isPublic : key === ROLES_KEY ? meta.roles : undefined,
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  function ctxFor(role?: UserRole): ExecutionContext {
    const auth = role ? { sub: "u1", tenantId: "t1", role } : undefined;
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ auth }) }),
    } as unknown as ExecutionContext;
  }

  it("allows a @Public route without authentication", () => {
    expect(makeGuard({ isPublic: true }).canActivate(ctxFor())).toBe(true);
  });

  it("DENIES a non-public route that declares no @Roles (fail-closed)", () => {
    expect(() =>
      makeGuard({ roles: undefined }).canActivate(ctxFor(UserRole.PG_MANAGER)),
    ).toThrow(ForbiddenException);
    expect(() =>
      makeGuard({ roles: [] }).canActivate(ctxFor(UserRole.PG_MANAGER)),
    ).toThrow(ForbiddenException);
  });

  it("allows a matching role", () => {
    expect(
      makeGuard({ roles: [UserRole.PG_MANAGER] }).canActivate(
        ctxFor(UserRole.PG_MANAGER),
      ),
    ).toBe(true);
  });

  it("lets PG_OWNER satisfy a @Roles(PG_MANAGER) gate (one-way hierarchy)", () => {
    expect(
      makeGuard({ roles: [UserRole.PG_MANAGER] }).canActivate(
        ctxFor(UserRole.PG_OWNER),
      ),
    ).toBe(true);
  });

  it("forbids a PG_MANAGER from a PG_OWNER-only route (hierarchy is one-way)", () => {
    expect(() =>
      makeGuard({ roles: [UserRole.PG_OWNER] }).canActivate(
        ctxFor(UserRole.PG_MANAGER),
      ),
    ).toThrow(ForbiddenException);
  });

  it("forbids an unauthenticated request to a role-gated route", () => {
    expect(() =>
      makeGuard({ roles: [UserRole.RESIDENT] }).canActivate(ctxFor()),
    ).toThrow(ForbiddenException);
  });
});
