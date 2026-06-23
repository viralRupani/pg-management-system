import { z } from "zod";
import { ShortStayStatus } from "../enums";

export const createShortStaySchema = z.object({
  bedId: z.string().uuid(),
  checkInDate: z.string().date(),
  checkOutDate: z.string().date(),
  guestName: z.string().min(1).max(200),
  guestPhone: z.string().optional(),
  feePaise: z.number().int().min(0),
});
export type CreateShortStayInput = z.infer<typeof createShortStaySchema>;

export const shortStaySummarySchema = z.object({
  id: z.string().uuid(),
  bedId: z.string().uuid(),
  bedLabel: z.string(),
  bookingId: z.string().uuid(),
  guestName: z.string(),
  guestPhone: z.string().nullable(),
  feePaise: z.number().int(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  status: z.nativeEnum(ShortStayStatus),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});
export type ShortStaySummary = z.infer<typeof shortStaySummarySchema>;
