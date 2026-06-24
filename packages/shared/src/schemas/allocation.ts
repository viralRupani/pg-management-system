import { z } from "zod";
import { OccupationType, TransferRequestStatus } from "../enums";

/**
 * Allocation DTOs. A manager allocates a resident to a bed; the system records
 * an allocation row (history-preserving) and flips the bed's status. Tenant
 * scoping is enforced by RLS + composite FKs — the body only carries ids.
 */
export const allocateBedSchema = z.object({
  bedId: z.string().uuid(),
  residentId: z.string().uuid(),
  startDate: z.string().date().optional(), // ISO date; defaults to today
});
export type AllocateBedInput = z.infer<typeof allocateBedSchema>;

export const allocationSummarySchema = z.object({
  id: z.string().uuid(),
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
});
export type AllocationSummary = z.infer<typeof allocationSummarySchema>;

/**
 * A vacant bed offered as a placement option for a given resident, with a
 * heuristic match score (higher = better fit) and human-readable reasons. The
 * ranker is a filter-plus-score convenience, not a rules engine — allocation
 * correctness is guaranteed by the DB invariants, not by this.
 */
export const availableBedSchema = z.object({
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  roomId: z.string().uuid(),
  roomLabel: z.string(),
  capacity: z.number().int(),
  monthlyRentPaise: z.number().int(),
  matchScore: z.number().int(),
  matchReasons: z.array(z.string()),
});
export type AvailableBed = z.infer<typeof availableBedSchema>;

/**
 * An occupied bed whose sitting resident has raised a move-out request — a
 * "soon to free" target a manager can pre-book a transfer onto. The move is
 * auto-executed once that resident actually exits and the bed frees.
 */
export const exitingBedSchema = z.object({
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  roomId: z.string().uuid(),
  roomLabel: z.string(),
  capacity: z.number().int(),
  occupationPreference: z.nativeEnum(OccupationType).nullable(),
  monthlyRentPaise: z.number().int(),
  occupantName: z.string(),
  exitRequestedDate: z.string().nullable(),
});
export type ExitingBed = z.infer<typeof exitingBedSchema>;

/**
 * A bed the manager may assign to a given resident from their profile, with the
 * reason it qualifies. The set depends on the resident:
 *  - VACANT: free now.
 *  - LEAVING_SOON: occupied, but the sitting resident has requested a move-out
 *    on/before this resident's planned move-in (a future booking target).
 *  - RESERVED_FREE_AFTER: held by a future booking whose move-in is after this
 *    short-stay guest's check-out, so the guest can occupy it in the interim.
 * `freesOnDate` is the date the bed is expected to free (null for VACANT, or an
 * unspecified exit date).
 */
export const eligibleBedSchema = z.object({
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  roomLabel: z.string(),
  capacity: z.number().int(),
  occupationPreference: z.nativeEnum(OccupationType).nullable(),
  bedsRemaining: z.number().int(),
  monthlyRentPaise: z.number().int(),
  kind: z.enum(["VACANT", "LEAVING_SOON", "RESERVED_FREE_AFTER"]),
  freesOnDate: z.string().nullable(),
  occupantName: z.string().nullable(),
});
export type EligibleBed = z.infer<typeof eligibleBedSchema>;

/**
 * Room-transfer DTOs. A manager pre-books a move for a resident to a target bed
 * by a planned date (soft hold — vacancy is re-checked at execution, the bed is
 * not locked). On the move day the manager executes it: the old allocation ends
 * and a new one starts atomically, and any mid-month rent delta is queued as a
 * signed adjustment consumed by the resident's next invoice.
 */
export const createTransferRequestSchema = z.object({
  residentId: z.string().uuid(),
  toBedId: z.string().uuid(),
  plannedDate: z.string().date(), // ISO date the move is planned for
});
export type CreateTransferRequestInput = z.infer<
  typeof createTransferRequestSchema
>;

/** Execute a pending transfer. `moveDate` defaults to today (the actual move day). */
export const executeTransferSchema = z.object({
  moveDate: z.string().date().optional(),
});
export type ExecuteTransferInput = z.infer<typeof executeTransferSchema>;

export const transferRequestSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  fromBedId: z.string().uuid(),
  fromBedLabel: z.string(),
  toBedId: z.string().uuid(),
  toBedLabel: z.string(),
  plannedDate: z.string(),
  status: z.nativeEnum(TransferRequestStatus),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type TransferRequestSummary = z.infer<
  typeof transferRequestSummarySchema
>;
