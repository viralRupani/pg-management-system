import { z } from "zod";
import { TenantStatus } from "../enums";
import { indianPhone } from "./phone";
import { contentTypeField } from "./upload";

/**
 * A UPI ID / VPA (e.g. `sunrise-pg@okhdfcbank`, `9876543210@paytm`). This system
 * has NO payment gateway — the resident just copies this into their own UPI app,
 * so validation is deliberately lenient (typo-catching, not parsing): a single
 * `@` with non-empty sides. Trimmed; an empty string on update clears it to null.
 */
export const upiVpa = z
  .string()
  .trim()
  .max(255)
  .regex(/^[^\s@]+@[^\s@]+$/, "Enter a valid UPI ID like name@bank");

/**
 * Tenant onboarding — creates a PG org plus its first manager.
 * Used by the platform-admin path (cross-tenant).
 */
export const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
  // White-labeling. logoKey is the storage key from POST /tenants/logo-url;
  // the public branding read presigns it into a download URL.
  logoKey: z.string().min(1).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // First manager for this PG
  manager: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    phone: indianPhone,
  }),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const tenantBrandingSchema = z.object({
  name: z.string(),
  slug: z.string(),
  // Presigned download URL derived from the stored logo key (null if no logo).
  logoUrl: z.string().url().nullable(),
  accentColor: z.string().nullable(),
  // Presigned download URL for the UPI QR code image (null if not configured).
  upiQrUrl: z.string().url().nullable(),
  // The PG's UPI ID / VPA residents can copy to pay (null if not configured).
  upiId: z.string().nullable(),
});
export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

/**
 * Manager self-service branding update (white-labeling). All fields optional;
 * at least one required. `logoKey` (from POST /tenants/logo-url) / `accentColor`
 * may be null to clear them. `name` cannot be cleared (it is required).
 */
export const updateBrandingSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    logoKey: z.string().min(1).nullable().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    upiQrKey: z.string().min(1).nullable().optional(),
    // A valid VPA to set it, or null to clear it.
    upiId: upiVpa.nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one branding field is required",
  });
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/**
 * Manager self-service update of the PG code (tenant slug) — the code residents
 * type to log in from the mobile app. Globally unique; same shape as the slug at
 * onboarding. Changing it does NOT log existing residents out (their sessions key
 * off tenant id), but they must use the new code on their NEXT login.
 */
export const updateSlugSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
});
export type UpdateSlugInput = z.infer<typeof updateSlugSchema>;

/** Result of a PG-code availability check. */
export const slugAvailabilitySchema = z.object({
  available: z.boolean(),
});
export type SlugAvailability = z.infer<typeof slugAvailabilitySchema>;

/** Manager asks for a presigned URL to upload a PG logo. */
export const logoUploadUrlSchema = z.object({
  contentType: contentTypeField,
});
export type LogoUploadUrlInput = z.infer<typeof logoUploadUrlSchema>;

/** Manager asks for a presigned URL to upload a UPI QR code image. */
export const upiQrUploadUrlSchema = z.object({
  contentType: contentTypeField,
});
export type UpiQrUploadUrlInput = z.infer<typeof upiQrUploadUrlSchema>;

/** Resident-accessible payment destination info for the active tenant. */
export const paymentInfoSchema = z.object({
  upiQrUrl: z.string().url().nullable(),
  // The PG's UPI ID / VPA the resident can copy into their UPI app (null if unset).
  upiId: z.string().nullable(),
});
export type PaymentInfo = z.infer<typeof paymentInfoSchema>;

export const tenantSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.nativeEnum(TenantStatus),
  activeResidents: z.number().int().nonnegative(),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;
