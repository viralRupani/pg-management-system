import { z } from "zod";

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
