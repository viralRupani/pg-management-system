import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, isNull, sql } from "drizzle-orm";
import {
  BILLING_RATE_PAISE,
  type BillingSnapshot,
  type PlatformOverviewRow,
  type SnapshotRunResult,
  TenantStatus,
} from "@pg/shared";
import { PLATFORM_DB, type Database } from "../db/database.module";
import { allocations, billingSnapshots, tenants } from "../db/schema";

/**
 * Platform metering: the billable headcount (active = currently bed-allocated
 * residents) per tenant, the monthly snapshot, and the live super-admin
 * overview. This is legitimately cross-tenant, so it reads via the PLATFORM_DB
 * (BYPASSRLS) pool — the one place that is allowed, alongside onboarding. It
 * NEVER re-enters per-tenant RLS context because it only reads aggregate counts
 * (no per-tenant operational data leaves this service).
 *
 * Billable event (CONFIRMED): ₹10 (BILLING_RATE_PAISE) per active resident per
 * month, recurring. The rate + amount are stored denormalized per snapshot so a
 * historical row is immutable if pricing changes.
 */
@Injectable()
export class MeteringService {
  constructor(@Inject(PLATFORM_DB) private readonly db: Database) {}

  private currentPeriod(): string {
    return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  }

  /** Active (currently bed-allocated) resident count per tenant id. */
  private async activeCountsByTenant(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        tenantId: allocations.tenantId,
        count: sql<number>`count(*)::int`,
      })
      .from(allocations)
      .where(isNull(allocations.endDate))
      .groupBy(allocations.tenantId);
    return new Map(rows.map((r) => [r.tenantId, r.count]));
  }

  /**
   * Snapshot the billable headcount for every ACTIVE tenant for a period
   * (defaults to the current month). Idempotent + refreshable: ON CONFLICT
   * (tenant_id, period) it recomputes the counts, so re-running mid-month
   * updates the figure rather than duplicating.
   */
  async snapshotMonth(period?: string): Promise<SnapshotRunResult> {
    const p = period ?? this.currentPeriod();
    const counts = await this.activeCountsByTenant();

    const activeTenants = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));

    let totalActive = 0;
    let totalAmount = 0;
    const values = activeTenants.map((t) => {
      const activeResidents = counts.get(t.id) ?? 0;
      const amountDuePaise = activeResidents * BILLING_RATE_PAISE;
      totalActive += activeResidents;
      totalAmount += amountDuePaise;
      return {
        tenantId: t.id,
        period: p,
        activeResidents,
        ratePaise: BILLING_RATE_PAISE,
        amountDuePaise,
      };
    });

    if (values.length > 0) {
      await this.db
        .insert(billingSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [billingSnapshots.tenantId, billingSnapshots.period],
          set: {
            activeResidents: sql`excluded.active_residents`,
            ratePaise: sql`excluded.rate_paise`,
            amountDuePaise: sql`excluded.amount_due_paise`,
            createdAt: sql`now()`,
          },
        });
    }

    return {
      period: p,
      tenantsSnapshotted: values.length,
      totalActiveResidents: totalActive,
      totalAmountDuePaise: totalAmount,
    };
  }

  /** Persisted snapshots (optionally for one period), newest first. */
  async listSnapshots(period?: string): Promise<BillingSnapshot[]> {
    const base = this.db
      .select({
        id: billingSnapshots.id,
        tenantId: billingSnapshots.tenantId,
        tenantName: tenants.name,
        period: billingSnapshots.period,
        activeResidents: billingSnapshots.activeResidents,
        ratePaise: billingSnapshots.ratePaise,
        amountDuePaise: billingSnapshots.amountDuePaise,
      })
      .from(billingSnapshots)
      .innerJoin(tenants, eq(tenants.id, billingSnapshots.tenantId))
      .orderBy(desc(billingSnapshots.period), tenants.name);
    const rows = period
      ? await base.where(eq(billingSnapshots.period, period))
      : await base;
    return rows;
  }

  /**
   * Live super-admin overview: each ACTIVE tenant with its CURRENT active
   * headcount and the recurring revenue estimate (headcount × rate). Computed
   * live (not from a snapshot), so it reflects the moment it is read.
   */
  async liveOverview(): Promise<PlatformOverviewRow[]> {
    const counts = await this.activeCountsByTenant();
    const rows = await this.db
      .select({
        tenantId: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE))
      .orderBy(tenants.name);

    return rows.map((t) => {
      const activeResidents = counts.get(t.tenantId) ?? 0;
      return {
        tenantId: t.tenantId,
        name: t.name,
        slug: t.slug,
        status: t.status as TenantStatus,
        activeResidents,
        estimatedRevenuePaise: activeResidents * BILLING_RATE_PAISE,
      };
    });
  }
}
