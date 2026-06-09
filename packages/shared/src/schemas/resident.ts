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

/** Query params for the manager's resident list — search + status filter + pagination. */
export const residentListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  status: z
    .union([z.nativeEnum(ResidentStatus), z.literal("ALL")])
    .default(ResidentStatus.ACTIVE),
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
