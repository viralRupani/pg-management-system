import { z } from "zod";
import { UserRole } from "../enums";
// import { indianPhone } from "./phone"; // SMS_OTP_LOGIN_DISABLED — see docs/backlog.md

/** Manager login — email + password. */
export const managerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type ManagerLoginInput = z.infer<typeof managerLoginSchema>;

/** Reusable password rule — same bounds as login. */
const password = z.string().min(8).max(128);

/** Change password (authenticated): verify the current one, set a new one. */
export const changePasswordSchema = z.object({
  currentPassword: password,
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Forgot password: request a reset link for an email. Always reports "sent". */
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Reset password: exchange a single-use reset token for a new password. */
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Resident OTP request — start the email-OTP login flow.
 * `pgCode` is the tenant slug the manager shared; email is unique only WITHIN a
 * PG (see auth_identities' per-role partial unique indexes), so we must know
 * the PG before resolving the resident.
 */
export const otpRequestSchema = z.object({
  pgCode: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** Resident OTP verify — exchange code for tokens. */
export const otpVerifySchema = z.object({
  pgCode: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  code: z.string().length(6).regex(/^\d{6}$/),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

// SMS_OTP_LOGIN_DISABLED — see docs/backlog.md. Phone-based resident login,
// preserved for when a paid SMS/WhatsApp provider is wired up. Revive by
// re-exporting these under the live `otpRequestSchema`/`otpVerifySchema` names
// (or a role-aware channel toggle) and un-commenting the API/mobile/web code
// that referenced them.
//
// export const phoneOtpRequestSchema = z.object({
//   pgCode: z
//     .string()
//     .min(2)
//     .max(40)
//     .regex(/^[a-z0-9-]+$/),
//   phone: indianPhone,
// });
// export type PhoneOtpRequestInput = z.infer<typeof phoneOtpRequestSchema>;
//
// export const phoneOtpVerifySchema = z.object({
//   pgCode: z
//     .string()
//     .min(2)
//     .max(40)
//     .regex(/^[a-z0-9-]+$/),
//   phone: indianPhone,
//   code: z.string().length(6).regex(/^\d{6}$/),
// });
// export type PhoneOtpVerifyInput = z.infer<typeof phoneOtpVerifySchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/** Decoded JWT payload — the source of truth for tenant + role. */
export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(), // userId
  tenantId: z.string().uuid().nullable(), // null only for PLATFORM_ADMIN
  role: z.nativeEnum(UserRole),
  // Present (true) only when a manager was given a temp password by an owner and
  // must set their own before accessing the app. Absent on all other tokens.
  mustChangePassword: z.boolean().optional(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
