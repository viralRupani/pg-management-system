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

/** Rename a building (pure relabel — no side effects, no guard). */
export const renameBuildingSchema = z.object({
  name: z.string().min(1).max(120),
});
export type RenameBuildingInput = z.infer<typeof renameBuildingSchema>;

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

/** Rename a floor (pure relabel — no side effects, no guard). */
export const renameFloorSchema = z.object({
  label: z.string().min(1).max(60),
});
export type RenameFloorInput = z.infer<typeof renameFloorSchema>;

// --- Rooms ---
export const createRoomSchema = z.object({
  floorId: z.string().uuid(),
  label: z.string().min(1).max(60),
  capacity: z.number().int().min(1).max(20).default(1),
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
  monthlyRentPaise: z.number().int(),
  occupationPreference: z.nativeEnum(OccupationType).nullable(),
  genderPreference: z.string().nullable(),
  ageMin: z.number().int().nullable(),
  ageMax: z.number().int().nullable(),
  nativePlacePreference: z.string().nullable(),
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

/** Update a room's editable settings (label, capacity, occupation preference).
 * Partial — only provided keys are written; all are side-effect-free relabels.
 * Rent edits still go through updateRoomRentSchema. `occupationPreference: null`
 * clears the preference; omitting the key leaves it unchanged. */
export const updateRoomSchema = z
  .object({
    label: z.string().min(1).max(60).optional(),
    capacity: z.number().int().min(1).max(20).optional(),
    occupationPreference: z.nativeEnum(OccupationType).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

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
  // The current occupant (the active allocation's resident, else the holder of a
  // PENDING booking for a RESERVED bed). Null for a VACANT bed. Lets the property
  // page reveal who's in a bed on hover + link back to that resident.
  occupantResidentId: z.string().uuid().nullable(),
  occupantName: z.string().nullable(),
});
export type BedSummary = z.infer<typeof bedSummarySchema>;

/** Rename a bed (pure relabel — no side effects, no guard). */
export const renameBedSchema = z.object({
  label: z.string().min(1).max(40),
});
export type RenameBedInput = z.infer<typeof renameBedSchema>;
