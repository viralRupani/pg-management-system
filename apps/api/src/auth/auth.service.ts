import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import {
  type AuthTokens,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type JwtPayload,
  type ManagerLoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type ResetPasswordInput,
  UserRole,
} from "@pg/shared";
import { ENV, type AppEnv } from "../config/env";
import { AuthRepository } from "./auth.repository";
import { OtpService } from "./otp.service";
import { PasswordResetService } from "./password-reset.service";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider";

/** Roles that authenticate with an email + password (and can reset it). */
const PASSWORD_ROLES: readonly UserRole[] = [
  UserRole.PG_MANAGER,
  UserRole.PG_OWNER,
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly otp: OtpService,
    private readonly reset: PasswordResetService,
    private readonly jwt: JwtService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
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

    const payload: JwtPayload = {
      sub: identity.userId ?? identity.id,
      tenantId: identity.tenantId,
      role: identity.role as UserRole,
    };
    if (identity.mustChangePassword) payload.mustChangePassword = true;
    return this.issueTokens(payload);
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
   * Change the caller's own password. The credential row is resolved from the
   * JWT principal (sub + tenantId + role): a manager's row is PG-scoped, an
   * owner's single credential row has tenantId NULL and is only addressable on
   * the owner's global token. We never trust an id from the request body.
   */
  async changePassword(
    principal: JwtPayload,
    input: ChangePasswordInput,
  ): Promise<AuthTokens> {
    const identity = await this.repo.findIdentityForPrincipal(
      principal.sub,
      principal.tenantId,
      principal.role,
    );
    if (!identity || !identity.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await argon2.verify(
      identity.passwordHash,
      input.currentPassword,
    );
    if (!ok) throw new UnauthorizedException("Current password is incorrect");
    if (input.newPassword === input.currentPassword) {
      throw new BadRequestException(
        "New password must differ from the current one",
      );
    }
    await this.repo.updatePasswordHash(
      identity.id,
      await argon2.hash(input.newPassword),
    );
    // Return fresh tokens so the caller can swap them without a re-login.
    // mustChangePassword is NOT included — updatePasswordHash cleared the flag.
    return this.issueTokens({
      sub: principal.sub,
      tenantId: principal.tenantId,
      role: principal.role,
    });
  }

  /**
   * Start a forgot-password flow. Resolve the identity by email and, if it's a
   * password-based account, email a single-use reset link. ALWAYS reports
   * `{ sent: true }` so the response can't be used to enumerate which emails
   * (or roles) exist.
   */
  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<{ sent: boolean }> {
    const identity = await this.repo.findIdentityByEmail(input.email);
    if (
      identity &&
      identity.passwordHash &&
      PASSWORD_ROLES.includes(identity.role as UserRole)
    ) {
      const token = await this.reset.issue(identity.id, input.email);
      const link = `${this.env.APP_BASE_URL}/reset-password?token=${token}`;
      try {
        await this.email.send(
          input.email,
          "Reset your PG Manager password",
          `Use this link to set a new password (valid for ${Math.round(
            this.env.PWRESET_TTL_SECONDS / 60,
          )} minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
        );
      } catch (err) {
        // A real delivery failure (SES throttle, unverified/sandboxed recipient,
        // transient error) must NOT change the response — otherwise a 500 here vs
        // a 200 for an unknown email becomes an account-enumeration oracle, and
        // the user gets a spurious error. Log for ops; still report { sent: true }.
        this.logger.error(
          `Password-reset email send failed: ${(err as Error).message}`,
        );
      }
    }
    return { sent: true };
  }

  /** Finish a forgot-password flow: spend the token, set the new password. */
  async resetPassword(input: ResetPasswordInput): Promise<{ ok: true }> {
    const identityId = await this.reset.consume(input.token);
    if (!identityId) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const identity = await this.repo.findIdentityById(identityId);
    if (!identity) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    await this.repo.updatePasswordHash(
      identity.id,
      await argon2.hash(input.newPassword),
    );
    return { ok: true };
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
