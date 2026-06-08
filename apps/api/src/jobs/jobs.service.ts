import { Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { InvoiceStatus } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { PlatformService } from "../platform/platform.service";
import { RentService } from "../rent/rent.service";
import { NotificationsService } from "../notifications/notifications.service";
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
  ) {}

  /** Generate monthly invoices for every active tenant. */
  async generateInvoicesAllTenants(period?: string): Promise<BatchResult> {
    return this.forEachTenant("invoice generation", async () => {
      const res = await this.rent.generateMonthly({ period });
      return res.generated;
    });
  }

  /** Send a rent reminder to every resident with a PENDING invoice. */
  async sendRentReminders(period?: string): Promise<BatchResult> {
    return this.forEachTenant("rent reminders", async () => {
      const db = this.ctx.db();
      const conds = period
        ? and(
            eq(invoices.status, InvoiceStatus.PENDING),
            eq(invoices.period, period),
          )
        : eq(invoices.status, InvoiceStatus.PENDING);
      const pending = await db
        .select({
          residentId: invoices.residentId,
          period: invoices.period,
          amountPaise: invoices.amountPaise,
        })
        .from(invoices)
        .where(conds);

      for (const inv of pending) {
        await this.notifications.notify(inv.residentId, {
          type: "RENT_REMINDER",
          title: "Rent due",
          body: `Your rent of ₹${(inv.amountPaise / 100).toFixed(2)} for ${inv.period} is pending.`,
        });
      }
      return pending.length;
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
