import { z } from "zod";
import {
  EmergencyRelation,
  KycStatus,
  OccupationType,
  ResidentStatus,
} from "../enums";
import { indianPhone } from "./phone";

/**
 * Manager registers a new resident in their PG. The emergency contact is
 * optional as a whole, but all-or-nothing: if any of name/relation/phone is
 * given, all three are required (a half-filled contact is useless).
 */
export const registerResidentSchema = z
  .object({
    name: z.string().min(2).max(120),
    phone: indianPhone,
    email: z.string().email().optional(),
    age: z.number().int().min(15).max(120),
    occupationType: z.nativeEnum(OccupationType).default(OccupationType.OTHER),
    nativePlace: z.string().max(120).optional(),
    emergencyContactName: z.string().min(2).max(120).optional(),
    emergencyContactRelation: z.nativeEnum(EmergencyRelation).optional(),
    emergencyContactPhone: indianPhone.optional(),
    joinDate: z.string().date().optional(), // ISO date; defaults to today server-side
  })
  .superRefine((d, ctx) => {
    const fields = [
      ["emergencyContactName", d.emergencyContactName],
      ["emergencyContactRelation", d.emergencyContactRelation],
      ["emergencyContactPhone", d.emergencyContactPhone],
    ] as const;
    const filled = fields.filter(([, v]) => v != null);
    if (filled.length > 0 && filled.length < fields.length) {
      for (const [path, v] of fields) {
        if (v == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message:
              "Emergency contact name, relation, and phone are all required together",
          });
        }
      }
    }
  });
export type RegisterResidentInput = z.infer<typeof registerResidentSchema>;

export const residentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  age: z.number().int().nullable(),
  occupationType: z.nativeEnum(OccupationType),
  nativePlace: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactRelation: z.nativeEnum(EmergencyRelation).nullable(),
  emergencyContactPhone: z.string().nullable(),
  status: z.nativeEnum(ResidentStatus),
  bedLabel: z.string().nullable(),
  roomCapacity: z.number().int().nullable(),
  kycStatus: z.nativeEnum(KycStatus),
});
export type ResidentSummary = z.infer<typeof residentSummarySchema>;

/** Query params for the manager's resident list — search + status filter + pagination. */
export const residentListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z
    .union([z.nativeEnum(ResidentStatus), z.literal("ALL")])
    .default(ResidentStatus.ACTIVE),
  // KYC rollup filter: PENDING = anything not VERIFIED (not submitted, awaiting
  // review, or rejected — i.e. KYC still needs chasing); VERIFIED = Aadhaar done.
  kyc: z
    .union([z.literal("ALL"), z.literal("PENDING"), z.literal("VERIFIED")])
    .default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ResidentListQuery = z.infer<typeof residentListQuerySchema>;

export const residentListResultSchema = z.object({
  items: z.array(residentSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type ResidentListResult = z.infer<typeof residentListResultSchema>;
