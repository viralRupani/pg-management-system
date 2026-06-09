import { z } from "zod";
import { TenantStatus } from "../enums";
import { indianPhone } from "./phone";

/**
 * PG-owner schemas. An owner is a cross-tenant identity (created by the platform
 * admin) that can create and manage multiple PGs and assign managers to each.
 * See root CLAUDE.md — owner has two identities: a global `owners` login anchor
 * and a per-tenant PG_OWNER `users` row in each owned PG.
 */

/** Platform admin creates a PG owner. */
export const createOwnerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type CreateOwnerInput = z.infer<typeof createOwnerSchema>;

export const ownerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});
export type OwnerSummary = z.infer<typeof ownerSummarySchema>;

/**
 * Owner creates a PG. Mirrors createTenantSchema but the first manager is
 * OPTIONAL — the owner can operate the PG directly via their per-tenant
 * PG_OWNER user row.
 */
export const createOwnerPgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, and hyphens only"),
  logoKey: z.string().min(1).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // Optional first manager for this PG.
  manager: z
    .object({
      name: z.string().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(8).max(128),
      phone: indianPhone,
    })
    .optional(),
});
export type CreateOwnerPgInput = z.infer<typeof createOwnerPgSchema>;

/** One PG an owner owns, with branding for the chooser UI. */
export const ownerPgSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.nativeEnum(TenantStatus),
  accentColor: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  activeResidents: z.number().int().nonnegative(),
});
export type OwnerPgSummary = z.infer<typeof ownerPgSummarySchema>;

/** Owner adds a manager to the active PG. */
export const createManagerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: indianPhone,
});
export type CreateManagerInput = z.infer<typeof createManagerSchema>;

export const managerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  // null = active; set = login revoked (soft-deactivated).
  deactivatedAt: z.string().nullable(),
});
export type ManagerSummary = z.infer<typeof managerSummarySchema>;
