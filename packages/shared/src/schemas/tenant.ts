import { z } from "zod";
import { TenantStatus } from "../enums";
import { indianPhone } from "./phone";
import { contentTypeField } from "./upload";

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
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one branding field is required",
  });
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** Manager asks for a presigned URL to upload a PG logo. */
export const logoUploadUrlSchema = z.object({
  contentType: contentTypeField,
});
export type LogoUploadUrlInput = z.infer<typeof logoUploadUrlSchema>;

export const tenantSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.nativeEnum(TenantStatus),
  activeResidents: z.number().int().nonnegative(),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;
