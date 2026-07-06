import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { InvoiceSchedule, InvoiceScheduleInput } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { invoiceSchedules } from "../db/schema";
import { istMomentUtc, istPeriod } from "../common/ist-date";
import { RentService } from "./rent.service";

/**
 * The `lastRunPeriod` to stamp on a freshly created schedule. If THIS month's
 * scheduled moment has already passed at creation time, seed the current period
 * so the dispatcher doesn't immediately back-fire for a day that's gone; if the
 * day is still ahead this month, return null so it fires on schedule this month.
 */
export function initialLastRunPeriod(
  now: Date,
  dayOfMonth: number,
  hour: number,
  minute: number,
): string | null {
  const period = istPeriod(now);
  return now >= istMomentUtc(period, dayOfMonth, hour, minute) ? period : null;
}

/**
 * Per-PG schedule for automatic monthly invoice generation. At most one row per
 * tenant; managers create/edit/delete it (deleting reverts the PG to manual-only
 * generation — opt-in). RLS isolates tenants, so every query is scoped to the
 * current tenant context automatically.
 *
 * `runDue()` is the per-tenant body of the dispatch job (see
 * JobsService.dispatchScheduledInvoices): it fires generation when the schedule's
 * IST moment for the current period has passed AND it hasn't already run for that
 * period (`lastRunPeriod`). That guard makes the run exactly-once-per-month and
 * gives catch-up semantics if the dispatcher was down at the scheduled minute.
 */
@Injectable()
export class InvoiceScheduleService {
  private readonly logger = new Logger(InvoiceScheduleService.name);

  constructor(
    private readonly ctx: TenantContextService,
    private readonly rent: RentService,
  ) {}

  /** The current tenant's schedule, or null when none is set. */
  async getSchedule(): Promise<InvoiceSchedule | null> {
    const db = this.ctx.db();
    const [row] = await db
      .select({
        dayOfMonth: invoiceSchedules.dayOfMonth,
        hour: invoiceSchedules.hour,
        minute: invoiceSchedules.minute,
        lastRunPeriod: invoiceSchedules.lastRunPeriod,
        updatedAt: invoiceSchedules.updatedAt,
      })
      .from(invoiceSchedules)
      .limit(1);
    if (!row) return null;
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }

  /**
   * Create or update the tenant's single schedule. On first create, seed
   * `lastRunPeriod` via `initialLastRunPeriod` so the schedule fires this month
   * if its day is still ahead, but does NOT back-fire for a day that has already
   * passed. Editing an existing schedule leaves `lastRunPeriod` untouched.
   * tenantId comes from the RLS context, never the body.
   */
  async upsertSchedule(input: InvoiceScheduleInput): Promise<InvoiceSchedule> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    await db
      .insert(invoiceSchedules)
      .values({
        tenantId,
        dayOfMonth: input.dayOfMonth,
        hour: input.hour,
        minute: input.minute,
        lastRunPeriod: initialLastRunPeriod(
          new Date(),
          input.dayOfMonth,
          input.hour,
          input.minute,
        ),
      })
      .onConflictDoUpdate({
        target: invoiceSchedules.tenantId,
        set: {
          dayOfMonth: input.dayOfMonth,
          hour: input.hour,
          minute: input.minute,
          updatedAt: new Date(),
        },
      });
    return (await this.getSchedule())!;
  }

  /** Remove the schedule → the PG reverts to manual-only generation. */
  async deleteSchedule(): Promise<{ deleted: boolean }> {
    const db = this.ctx.db();
    const tenantId = this.ctx.currentTenantId()!;
    const res = await db
      .delete(invoiceSchedules)
      .where(eq(invoiceSchedules.tenantId, tenantId));
    return { deleted: (res.rowCount ?? 0) > 0 };
  }

  /**
   * Dispatch body for the CURRENT tenant context. Generates this period's
   * invoices when the schedule's IST moment has arrived and it hasn't already
   * run for the period; stamps `lastRunPeriod` so it fires at most once a month.
   * Returns the number of invoices generated (0 when not due / no schedule).
   */
  async runDue(now: Date = new Date()): Promise<number> {
    const db = this.ctx.db();
    const [row] = await db.select().from(invoiceSchedules).limit(1);
    if (!row) return 0;

    const period = istPeriod(now);
    if (row.lastRunPeriod === period) return 0; // already generated this month
    const moment = istMomentUtc(period, row.dayOfMonth, row.hour, row.minute);
    if (now < moment) return 0; // scheduled moment not yet reached

    const res = await this.rent.generateMonthly({ period });
    await db
      .update(invoiceSchedules)
      .set({ lastRunPeriod: period })
      .where(eq(invoiceSchedules.id, row.id));
    this.logger.log(
      `scheduled invoice run for tenant ${row.tenantId} ${period}: ${res.generated} generated`,
    );
    return res.generated;
  }

  /**
   * Generate the current-period invoice for a SINGLE just-allocated resident when
   * the PG's scheduled generation moment for that period has already passed — i.e.
   * the resident moved in (registered + bed-assigned live) after the automatic run
   * for the month would have fired, so the tenant-wide run has already skipped
   * them and won't re-bill them this month. Called best-effort from
   * `AllocationService.allocate`.
   *
   * Fires only when a schedule exists (a manual-only PG has no "scheduled date",
   * so its manager controls generation) AND the schedule's IST moment for the
   * resident's join period is at/behind `now` (if the moment is still ahead, the
   * normal tenant-wide run will pick this resident up on schedule — nothing to do
   * here). Idempotent via `generateMonthly` (skips a resident who already has a
   * live invoice this period), so it never double-bills alongside `runDue`.
   *
   * Crucially it does NOT stamp `lastRunPeriod`: that flag gates the tenant-wide
   * `runDue`, and suppressing the whole PG's monthly run to cover one late joiner
   * would be wrong. Scoped generation and the monthly run stay independent.
   */
  async generateForResidentIfDue(
    residentId: string,
    startDate: Date,
    now: Date = new Date(),
  ): Promise<number> {
    const db = this.ctx.db();
    const [row] = await db.select().from(invoiceSchedules).limit(1);
    if (!row) return 0; // manual-only PG — the manager controls generation

    const period = istPeriod(startDate);
    const moment = istMomentUtc(period, row.dayOfMonth, row.hour, row.minute);
    if (now < moment) return 0; // scheduled run for this period hasn't fired yet

    const res = await this.rent.generateMonthly({
      period,
      residentIds: [residentId],
    });
    this.logger.log(
      `late-join invoice for resident ${residentId} tenant ${row.tenantId} ${period}: ${res.generated} generated`,
    );
    return res.generated;
  }
}
