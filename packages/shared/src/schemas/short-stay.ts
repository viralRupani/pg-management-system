import { z } from "zod";
import { ShortStayStatus } from "../enums";

/**
 * Assign a short-stay guest (a resident registered with `isShortStay`) to a
 * bed. The check-in/check-out dates, per-day charge, and total are read from
 * the resident record captured at registration — the body only carries ids.
 */
export const createShortStaySchema = z.object({
  residentId: z.string().uuid(),
  bedId: z.string().uuid(),
});
export type CreateShortStayInput = z.infer<typeof createShortStaySchema>;

export const shortStaySummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  // The booking this stay sits under, when the bed is reserved for a future
  // move-in; null when the guest occupies a plain vacant bed.
  bookingId: z.string().uuid().nullable(),
  guestName: z.string(),
  guestPhone: z.string().nullable(),
  perDayChargePaise: z.number().int(),
  feePaise: z.number().int(), // total = days × per-day, paid upfront
  checkInDate: z.string(),
  checkOutDate: z.string(),
  status: z.nativeEnum(ShortStayStatus),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});
export type ShortStaySummary = z.infer<typeof shortStaySummarySchema>;
