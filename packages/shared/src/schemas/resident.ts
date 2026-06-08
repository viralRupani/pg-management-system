import { z } from "zod";
import { OccupationType, ResidentStatus } from "../enums";

/** Manager registers a new resident in their PG. */
export const registerResidentSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  email: z.string().email().optional(),
  age: z.number().int().min(16).max(120).optional(),
  occupationType: z.nativeEnum(OccupationType).default(OccupationType.OTHER),
  nativePlace: z.string().max(120).optional(),
  emergencyContact: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  joinDate: z.string().date().optional(), // ISO date; defaults to today server-side
});
export type RegisterResidentInput = z.infer<typeof registerResidentSchema>;

export const residentSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  occupationType: z.nativeEnum(OccupationType),
  nativePlace: z.string().nullable(),
  status: z.nativeEnum(ResidentStatus),
  bedLabel: z.string().nullable(),
});
export type ResidentSummary = z.infer<typeof residentSummarySchema>;
