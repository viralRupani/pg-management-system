import { z } from "zod";

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
