import { z } from "zod";
import { ChargeFrequency } from "../enums";

/**
 * Manager/owner adds an extra charge to a resident. `residentId` is the TARGET
 * (a manager acts across residents within the tenant) — not the actor; the
 * creator id is taken from the JWT. `amountPaise` is positive integer paise.
 */
export const createExtraChargeSchema = z.object({
  residentId: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  amountPaise: z.number().int().positive(),
  frequency: z.nativeEnum(ChargeFrequency),
});
export type CreateExtraChargeInput = z.infer<typeof createExtraChargeSchema>;

/** A charge definition shown in the manager's resident-profile panel. */
export const extraChargeSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  label: z.string(),
  amountPaise: z.number().int(),
  frequency: z.nativeEnum(ChargeFrequency),
  active: z.boolean(),
  appliedAt: z.string().nullable(), // ONE_TIME: set once applied; null = queued
  createdAt: z.string(),
});
export type ExtraChargeSummary = z.infer<typeof extraChargeSummarySchema>;

/** One applied charge line on an invoice — the breakdown shown to all surfaces. */
export const invoiceChargeSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  label: z.string(),
  amountPaise: z.number().int(),
  period: z.string(),
  createdAt: z.string(),
});
export type InvoiceCharge = z.infer<typeof invoiceChargeSchema>;
