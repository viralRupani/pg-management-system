import { z } from "zod";
import { BedStatus, OccupationType } from "../enums";

/**
 * Property hierarchy DTOs: buildings -> floors -> rooms -> beds. Parent ids are
 * passed in the body and validated against the tenant via RLS + composite FKs;
 * the tenant_id itself is always taken from the auth context, never the body.
 * Money is integer paise everywhere (project-wide convention).
 */

// --- Buildings ---
export const createBuildingSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
});
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;

export const buildingSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
});
export type BuildingSummary = z.infer<typeof buildingSummarySchema>;

// --- Floors ---
export const createFloorSchema = z.object({
  buildingId: z.string().uuid(),
  label: z.string().min(1).max(60),
  floorNumber: z.number().int().min(-5).max(200).default(0),
});
export type CreateFloorInput = z.infer<typeof createFloorSchema>;

export const floorSummarySchema = z.object({
  id: z.string().uuid(),
  buildingId: z.string().uuid(),
  label: z.string(),
  floorNumber: z.number().int(),
});
export type FloorSummary = z.infer<typeof floorSummarySchema>;

// --- Rooms ---
export const createRoomSchema = z.object({
  floorId: z.string().uuid(),
  label: z.string().min(1).max(60),
  capacity: z.number().int().min(1).max(20).default(1),
  sharingType: z.string().max(40).optional(),
  monthlyRentPaise: z.number().int().min(0).default(0),
  // Allocation-preference tags (all optional).
  occupationPreference: z.nativeEnum(OccupationType).optional(),
  genderPreference: z.string().max(20).optional(),
  ageMin: z.number().int().min(0).max(120).optional(),
  ageMax: z.number().int().min(0).max(120).optional(),
  nativePlacePreference: z.string().max(120).optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const roomSummarySchema = z.object({
  id: z.string().uuid(),
  floorId: z.string().uuid(),
  label: z.string(),
  capacity: z.number().int(),
  sharingType: z.string().nullable(),
  monthlyRentPaise: z.number().int(),
  occupationPreference: z.nativeEnum(OccupationType).nullable(),
  genderPreference: z.string().nullable(),
  ageMin: z.number().int().nullable(),
  ageMax: z.number().int().nullable(),
  nativePlacePreference: z.string().nullable(),
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

// --- Beds ---
export const createBedSchema = z.object({
  roomId: z.string().uuid(),
  label: z.string().min(1).max(40),
});
export type CreateBedInput = z.infer<typeof createBedSchema>;

export const bedSummarySchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  label: z.string(),
  status: z.nativeEnum(BedStatus),
});
export type BedSummary = z.infer<typeof bedSummarySchema>;
