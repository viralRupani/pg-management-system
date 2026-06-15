import { z } from "zod";
import { BookingStatus } from "../enums";

/**
 * Future-dated bed booking DTOs. A manager holds a bed for an incoming resident
 * before their move-in date and records the deposit up front. The bed is held
 * (shown as occupied, NOT a live allocation) and no rent is billed until a daily
 * job activates the booking on/after the move-in date. Tenant scoping is enforced
 * by RLS + composite FKs — the body only carries ids and amounts.
 */
export const createBookingSchema = z.object({
  residentId: z.string().uuid(),
  bedId: z.string().uuid(),
  // ISO date the resident will move in; must be today or later. (IST runs ahead
  // of UTC, so comparing to the UTC date never rejects a legitimate IST "today".)
  moveInDate: z
    .string()
    .date()
    .refine((d) => d >= new Date().toISOString().slice(0, 10), {
      message: "moveInDate must be today or a future date",
    }),
  depositAmountPaise: z.number().int().min(0), // held now, integer paise
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingSummarySchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  residentName: z.string(),
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  moveInDate: z.string(),
  depositAmountPaise: z.number().int(),
  status: z.nativeEnum(BookingStatus),
  createdAt: z.string(),
  activatedAt: z.string().nullable(),
});
export type BookingSummary = z.infer<typeof bookingSummarySchema>;
