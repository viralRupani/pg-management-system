import { Injectable } from "@nestjs/common";
import { and, eq, inArray, isNotNull, ne, sql, isNull } from "drizzle-orm";
import {
  ComplaintStatus,
  DocumentStatus,
  DocumentType,
  PaymentStatus,
  ResidentStatus,
  UserRole,
  type DashboardAlerts,
  type DashboardStats,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  beds,
  bookings,
  complaints,
  documents,
  invoices,
  payments,
  users,
  rooms,
} from "../db/schema";

/** Returns current period as 'YYYY-MM' in IST. */
function currentIstPeriod(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

@Injectable()
export class DashboardService {
  constructor(private readonly ctx: TenantContextService) {}

  async stats(): Promise<DashboardStats> {
    const db = this.ctx.db();
    const period = currentIstPeriod();

    const [bedCounts, invoiceBreakdown, overdueRow, invoicesByMonth, paymentsByMonth, upcoming] =
      await Promise.all([
        // 1. Bed status counts
        db
          .select({
            status: beds.status,
            count: sql<number>`count(*)::int`,
          })
          .from(beds)
          .groupBy(beds.status),

        // 2. Invoice status breakdown for current month
        db
          .select({
            status: invoices.status,
            count: sql<number>`count(*)::int`,
            total: sql<number>`coalesce(sum(${invoices.amountPaise}), 0)::int`,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.period, period),
              ne(invoices.status, PaymentStatus.REJECTED),
              isNull(invoices.deletedAt)
            )
          )
          .groupBy(invoices.status),

        // 3. All-time overdue total
        db
          .select({
            total: sql<number>`coalesce(sum(${invoices.amountPaise}), 0)::int`,
          })
          .from(invoices)
          .where(eq(invoices.status, "OVERDUE")),

        // 4a. Invoices grouped by period — last 6 months
        db
          .select({
            period: invoices.period,
            invoicedPaise: sql<number>`coalesce(sum(${invoices.amountPaise}), 0)::int`,
          })
          .from(invoices)
          .where(
            sql`${invoices.period} >= to_char(
              date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months',
              'YYYY-MM'
            ) AND invoices.deleted_at IS NULL AND invoices.status <> 'REJECTED'`,
          )
          .groupBy(invoices.period),

        // 4b. Approved payments grouped by IST month — last 6 months
        db
          .select({
            period: sql<string>`to_char(${payments.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM')`,
            collectedPaise: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::int`,
          })
          .from(payments)
          .where(
            sql`${payments.status} = 'APPROVED'
              and ${payments.createdAt} >= date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '5 months'`,
          )
          .groupBy(
            sql`to_char(${payments.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM')`,
          ),

        // 5. Upcoming bookings — PENDING, move-in within next 30 days
        db
          .select({
            id: bookings.id,
            residentName: users.name,
            moveInDate: sql<string>`to_char(
              (${bookings.moveInDate} at time zone 'Asia/Kolkata')::date,
              'YYYY-MM-DD'
            )`,
            bedLabel: beds.label,
            roomLabel: rooms.label,
          })
          .from(bookings)
          .innerJoin(
            users,
            sql`${bookings.residentId} = ${users.id} and ${bookings.tenantId} = ${users.tenantId}`,
          )
          .innerJoin(
            beds,
            sql`${bookings.bedId} = ${beds.id} and ${bookings.tenantId} = ${beds.tenantId}`,
          )
          .innerJoin(
            rooms,
            sql`${beds.roomId} = ${rooms.id} and ${beds.tenantId} = ${rooms.tenantId}`,
          )
          .where(
            sql`${bookings.status} = 'PENDING'
              and (${bookings.moveInDate} at time zone 'Asia/Kolkata')::date
                  <= (now() at time zone 'Asia/Kolkata')::date + interval '30 days'`,
          )
          .orderBy(bookings.moveInDate)
          .limit(10),
      ]);

    // Aggregate bed counts
    const bedMap: Record<string, number> = {};
    for (const r of bedCounts) bedMap[r.status] = r.count;
    const occupiedBeds = bedMap["OCCUPIED"] ?? 0;
    const reservedBeds = bedMap["RESERVED"] ?? 0;
    const vacantBeds = bedMap["VACANT"] ?? 0;
    const totalBeds = occupiedBeds + reservedBeds + vacantBeds;

    // Aggregate invoice breakdown for current month
    const invoiceMap: Record<string, { count: number; total: number }> = {};
    for (const r of invoiceBreakdown) invoiceMap[r.status] = { count: r.count, total: r.total };
    const currentMonth = {
      period,
      invoicedPaise:
        (invoiceMap["PENDING"]?.total ?? 0) +
        (invoiceMap["OVERDUE"]?.total ?? 0) +
        (invoiceMap["PAID"]?.total ?? 0) +
        (invoiceMap["WAIVED"]?.total ?? 0),
      collectedPaise: invoiceMap["PAID"]?.total ?? 0,
      pendingCount: invoiceMap["PENDING"]?.count ?? 0,
      overdueCount: invoiceMap["OVERDUE"]?.count ?? 0,
      paidCount: invoiceMap["PAID"]?.count ?? 0,
      waivedCount: invoiceMap["WAIVED"]?.count ?? 0,
    };

    // Build the 6-month revenue array (fill gaps with 0)
    const sixMonths = buildSixMonthSlots(period);
    const invByPeriod = new Map(invoicesByMonth.map((r) => [r.period, r.invoicedPaise]));
    const colByPeriod = new Map(paymentsByMonth.map((r) => [r.period, r.collectedPaise]));
    const revenueByMonth = sixMonths.map((p) => ({
      period: p,
      invoicedPaise: invByPeriod.get(p) ?? 0,
      collectedPaise: colByPeriod.get(p) ?? 0,
    }));

    return {
      totalBeds,
      occupiedBeds,
      reservedBeds,
      vacantBeds,
      overdueTotalPaise: overdueRow[0]?.total ?? 0,
      currentMonth,
      revenueByMonth,
      upcomingBookings: upcoming,
    };
  }

  /**
   * Lightweight "needs attention" counts for the manager (bell badge + dashboard
   * alerts panel). All tenant-scoped aggregates under RLS — no fan-out over the
   * full roster, so it stays cheap even with hundreds of residents. Kept apart
   * from the heavier `stats()` so the bell can poll it from every page.
   */
  async alerts(): Promise<DashboardAlerts> {
    const db = this.ctx.db();

    const [exitRows, exitCountRow, paymentsRow, kycRow, complaintsRow] =
      await Promise.all([
        // Pending move-out requests — capped list for the dropdown/panel.
        db
          .select({
            residentId: users.id,
            name: users.name,
            requestedDate: sql<string>`to_char(${users.exitRequestedDate}, 'YYYY-MM-DD')`,
            requestedAt: users.exitRequestedAt,
            note: users.exitRequestNote,
          })
          .from(users)
          .where(
            and(
              eq(users.role, UserRole.RESIDENT),
              eq(users.status, ResidentStatus.ACTIVE),
              isNotNull(users.exitRequestedAt),
            ),
          )
          .orderBy(users.exitRequestedAt)
          .limit(10),

        // Total pending move-out requests (the list above is capped at 10).
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(
            and(
              eq(users.role, UserRole.RESIDENT),
              eq(users.status, ResidentStatus.ACTIVE),
              isNotNull(users.exitRequestedAt),
            ),
          ),

        // Payments awaiting review.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(payments)
          .where(eq(payments.status, PaymentStatus.SUBMITTED)),

        // KYC (Aadhaar) docs uploaded and awaiting verification.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(documents)
          .where(
            and(
              eq(documents.type, DocumentType.AADHAAR),
              eq(documents.status, DocumentStatus.PENDING),
            ),
          ),

        // Open / in-progress complaints.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(complaints)
          .where(
            inArray(complaints.status, [
              ComplaintStatus.OPEN,
              ComplaintStatus.IN_PROGRESS,
            ]),
          ),
      ]);

    const exitCount = exitCountRow[0]?.count ?? 0;
    const paymentsToReview = paymentsRow[0]?.count ?? 0;
    const kycToVerify = kycRow[0]?.count ?? 0;
    const openComplaints = complaintsRow[0]?.count ?? 0;

    return {
      exitRequests: {
        count: exitCount,
        items: exitRows.map((r) => ({
          residentId: r.residentId,
          name: r.name,
          requestedDate: r.requestedDate,
          requestedAt: r.requestedAt!.toISOString(),
          note: r.note,
        })),
      },
      paymentsToReview,
      kycToVerify,
      openComplaints,
      total: exitCount + paymentsToReview + kycToVerify + openComplaints,
    };
  }
}

/** Returns an array of 6 'YYYY-MM' strings ending at currentPeriod, oldest first. */
function buildSixMonthSlots(currentPeriod: string): string[] {
  const [y, m] = currentPeriod.split("-").map(Number);
  const slots: string[] = [];
  for (let i = 5; i >= 0; i--) {
    let month = m - i;
    let year = y;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    slots.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return slots;
}
