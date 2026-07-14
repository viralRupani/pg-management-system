import { z } from "zod";
import { ExitPendingType } from "../enums";

export const dashboardUpcomingBookingSchema = z.object({
  id: z.string(),
  residentName: z.string(),
  moveInDate: z.string(), // YYYY-MM-DD
  bedLabel: z.string(),
  roomLabel: z.string(),
});

export const dashboardRevenueMonthSchema = z.object({
  period: z.string(), // YYYY-MM
  invoicedPaise: z.number(),
  collectedPaise: z.number(),
});

export const dashboardCurrentMonthSchema = z.object({
  period: z.string(), // YYYY-MM
  invoicedPaise: z.number(),
  collectedPaise: z.number(),
  pendingCount: z.number(),
  overdueCount: z.number(),
  paidCount: z.number(),
  waivedCount: z.number(),
});

export const dashboardStatsSchema = z.object({
  // Occupancy
  totalBeds: z.number(),
  occupiedBeds: z.number(),
  reservedBeds: z.number(),
  vacantBeds: z.number(),

  // Financials
  overdueTotalPaise: z.number(),
  currentMonth: dashboardCurrentMonthSchema,

  // Revenue trend (last 6 months, oldest first)
  revenueByMonth: z.array(dashboardRevenueMonthSchema),

  // Upcoming move-ins (next 30 days)
  upcomingBookings: z.array(dashboardUpcomingBookingSchema),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type DashboardCurrentMonth = z.infer<typeof dashboardCurrentMonthSchema>;
export type DashboardRevenueMonth = z.infer<typeof dashboardRevenueMonthSchema>;
export type DashboardUpcomingBooking = z.infer<typeof dashboardUpcomingBookingSchema>;

// A single resident action awaiting a manager decision, surfaced in the
// manager's alerts feed — a new request, a proposed month change, or a
// cancellation of an already-approved move-out.
export const dashboardExitRequestSchema = z.object({
  residentId: z.string().uuid(),
  name: z.string(),
  pendingType: z.nativeEnum(ExitPendingType),
  requestedDate: z.string().nullable(), // YYYY-MM-DD proposed date; null for CANCEL
  requestedAt: z.string(), // ISO timestamp the action was raised
  note: z.string().nullable(),
});

/**
 * Lightweight "needs attention" counts for the manager — powers the topbar bell
 * badge (polled from every page) and the dashboard alerts panel. Kept separate
 * from the heavier `stats()` so the bell can poll cheaply.
 */
export const dashboardAlertsSchema = z.object({
  exitRequests: z.object({
    count: z.number(),
    items: z.array(dashboardExitRequestSchema),
  }),
  paymentsToReview: z.number(),
  kycToVerify: z.number(),
  openComplaints: z.number(),
  total: z.number(), // sum of all pending-action counts — the bell badge number
});

export type DashboardExitRequest = z.infer<typeof dashboardExitRequestSchema>;
export type DashboardAlerts = z.infer<typeof dashboardAlertsSchema>;
