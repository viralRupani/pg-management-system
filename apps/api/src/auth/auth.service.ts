import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import {
  type AuthTokens,
  type JwtPayload,
  type ManagerLoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  UserRole,
} from "@pg/shared";
import { ENV, type AppEnv } from "../config/env";
import { AuthRepository } from "./auth.repository";
import { OtpService } from "./otp.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: AppEnv,
  ) {}

  async managerLogin(input: ManagerLoginInput): Promise<AuthTokens> {
    const identity = await this.repo.findIdentityByEmail(input.email);
    if (
      !identity ||
      !identity.passwordHash ||
      identity.role === UserRole.RESIDENT
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await argon2.verify(identity.passwordHash, input.password);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    return this.issueTokens({
      sub: identity.userId ?? identity.id,
      tenantId: identity.tenantId,
      role: identity.role as UserRole,
    });
  }

  async requestOtp(input: OtpRequestInput): Promise<{ sent: boolean }> {
    const tenant = await this.repo.resolveTenantBySlug(input.pgCode);
    // Do not reveal whether the PG or resident exists — always report "sent".
    if (tenant) {
      const identity = await this.repo.findResidentIdentity(
        tenant.id,
        input.phone,
      );
      if (identity) await this.otp.issue(tenant.id, input.phone);
    }
    return { sent: true };
  }

  async verifyOtp(input: OtpVerifyInput): Promise<AuthTokens> {
    const tenant = await this.repo.resolveTenantBySlug(input.pgCode);
    if (!tenant) throw new UnauthorizedException("Invalid code");

    const ok = await this.otp.verify(tenant.id, input.phone, input.code);
    if (!ok) throw new UnauthorizedException("Invalid code");

    const identity = await this.repo.findResidentIdentity(
      tenant.id,
      input.phone,
    );
    if (!identity) throw new UnauthorizedException("Invalid code");

    return this.issueTokens({
      sub: identity.userId ?? identity.id,
      tenantId: tenant.id,
      role: UserRole.RESIDENT,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // A deactivated manager's credential is deleted, but their signed refresh
    // token stays valid for the full refresh TTL. Re-check the credential on
    // refresh so revocation actually takes effect (bounded by the short access
    // TTL) instead of lingering for ~30 days. Only managers are deactivatable;
    // residents (OTP) and owners (whose PG-scoped principal has no credential
    // row) keep their existing refresh behaviour.
    if (payload.role === UserRole.PG_MANAGER && payload.tenantId) {
      const identity = await this.repo.findIdentityByUserId(
        payload.sub,
        payload.tenantId,
      );
      if (!identity) {
        throw new UnauthorizedException("Account is no longer active");
      }
    }

    return this.issueTokens({
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    });
  }

  /**
   * Mint an access+refresh pair for an arbitrary payload. Used by the owner
   * module to issue a PG-scoped token when an owner switches into one of their
   * PGs (sub = that PG's PG_OWNER user row, tenantId = the PG).
   */
  issueTokensFor(payload: JwtPayload): Promise<AuthTokens> {
    return this.issueTokens(payload);
  }

  private async issueTokens(payload: JwtPayload): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload),
      this.jwt.signAsync(payload, {
        secret: this.env.JWT_REFRESH_SECRET,
        expiresIn: this.env.JWT_REFRESH_TTL,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
