import { z } from "zod";
import { UserRole } from "../enums";

/** Manager login — email + password. */
export const managerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type ManagerLoginInput = z.infer<typeof managerLoginSchema>;

/**
 * Resident OTP request — start the phone-OTP flow.
 * `pgCode` is the tenant slug the manager shared; phone is unique only WITHIN a
 * PG, so we must know the PG before resolving the resident.
 */
export const otpRequestSchema = z.object({
  pgCode: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, "Must be a valid E.164-ish phone number"),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

/** Resident OTP verify — exchange code for tokens. */
export const otpVerifySchema = z.object({
  pgCode: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  code: z.string().length(6).regex(/^\d{6}$/),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/** Decoded JWT payload — the source of truth for tenant + role. */
export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(), // userId
  tenantId: z.string().uuid().nullable(), // null only for PLATFORM_ADMIN
  role: z.nativeEnum(UserRole),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
