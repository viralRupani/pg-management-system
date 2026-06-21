import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { InvoiceStatus } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { PlatformService } from "../platform/platform.service";
import { RentService } from "../rent/rent.service";
import { NotificationsService } from "../notifications/notifications.service";
import { BookingsService } from "../bookings/bookings.service";
import { AllocationService } from "../allocation/allocation.service";
import { invoices } from "../db/schema";

export interface BatchResult {
  tenants: number;
  affected: number; // invoices generated / reminders sent
  failures: string[]; // tenant ids that errored
}

/**
 * Cross-tenant scheduled work. The job lists active tenant ids via the platform
 * seam (BYPASSRLS), then re-enters EACH tenant under RLS context
 * (TenantContextService.run) to do the per-tenant work on the app pool — so a
 * bug can never cross-bill, and one tenant's failure is caught and does not
 * abort the rest of the batch.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly ctx: TenantContextService,
    private readonly platform: PlatformService,
    private readonly rent: RentService,
    private readonly notifications: NotificationsService,
    private readonly bookings: BookingsService,
    private readonly allocation: AllocationService,
  ) {}

  /** Activate every due future-dated booking in every active tenant. */
  async activateBookingsAllTenants(): Promise<BatchResult> {
    return this.forEachTenant("activate bookings", () =>
      this.bookings.activateDue(),
    );
  }

  /** Execute every due pre-booked room transfer whose target bed is now free. */
  async activateTransfersAllTenants(): Promise<BatchResult> {
    return this.forEachTenant("activate transfers", () =>
      this.allocation.activateDueTransfers(),
    );
  }

  /** Generate monthly invoices for every active tenant. */
  async generateInvoicesAllTenants(period?: string): Promise<BatchResult> {
    return this.forEachTenant("invoice generation", async () => {
      const res = await this.rent.generateMonthly({ period });
      return res.generated;
    });
  }

  /** Flip past-due PENDING invoices to OVERDUE in every active tenant. */
  async markOverdueAllTenants(period?: string): Promise<BatchResult> {
    return this.forEachTenant("mark overdue", async () => {
      const res = await this.rent.markOverdue(period);
      return res.flipped;
    });
  }

  /**
   * Remind every resident who owes rent. Scoped to UNPAID & DUE invoices only:
   * status in (PENDING, OVERDUE) and the due date has been reached — so a
   * not-yet-due invoice isn't nagged, and a settled (PAID/WAIVED) one is never
   * reminded. The old unscoped query notified on *every* PENDING invoice
   * regardless of due date. Policy: a daily nudge while rent is due/overdue is
   * intended for offline-UPI collection; the daily cron is the cadence, so no
   * extra per-day dedup is needed. Optionally narrowed to one `period`.
   */
  async sendRentReminders(period?: string): Promise<BatchResult> {
    return this.forEachTenant("rent reminders", async () => {
      const db = this.ctx.db();
      const conds = [
        inArray(invoices.status, [
          InvoiceStatus.PENDING,
          InvoiceStatus.OVERDUE,
        ]),
        sql`${invoices.dueDate} <= now()`,
      ];
      if (period) conds.push(eq(invoices.period, period));
      const due = await db
        .select({
          residentId: invoices.residentId,
          period: invoices.period,
          amountPaise: invoices.amountPaise,
          status: invoices.status,
        })
        .from(invoices)
        .where(and(...conds));

      for (const inv of due) {
        const overdue = inv.status === InvoiceStatus.OVERDUE;
        await this.notifications.notify(inv.residentId, {
          type: "RENT_REMINDER",
          title: overdue ? "Rent overdue" : "Rent due",
          body: `Your rent of ₹${(inv.amountPaise / 100).toFixed(2)} for ${inv.period} is ${overdue ? "overdue" : "pending"}.`,
        });
      }
      return due.length;
    });
  }

  /** Run `work` inside each active tenant's RLS context, isolating failures. */
  private async forEachTenant(
    label: string,
    work: () => Promise<number>,
  ): Promise<BatchResult> {
    const tenantIds = await this.platform.listActiveTenantIds();
    let affected = 0;
    const failures: string[] = [];

    for (const tenantId of tenantIds) {
      try {
        affected += await this.ctx.run(tenantId, work);
      } catch (err) {
        failures.push(tenantId);
        this.logger.error(`${label} failed for tenant ${tenantId}`, err as Error);
      }
    }
    return { tenants: tenantIds.length, affected, failures };
  }
}
