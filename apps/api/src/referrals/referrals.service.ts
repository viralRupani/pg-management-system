import { Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import type { ReferralSettings, ReferralSummary } from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { referrals, tenants, users } from "../db/schema";

/**
 * Refer & earn: the manager-configured per-PG discount amount (one nullable
 * column on `tenants`, so there's no separate settings table — see
 * `InvoiceScheduleService` for the fuller CRUD-on-its-own-table version of
 * this shape), plus the per-resident "who have I referred" read used on the
 * referrer's profile. Earning/applying a referral happens elsewhere
 * (`qualifyReferralIfAny`, `RentService.generateMonthly`); this service is
 * settings + read-only history.
 */
@Injectable()
export class ReferralsService {
  constructor(private readonly ctx: TenantContextService) {}

  /** The current tenant's configured discount, or null when not set. */
  async getSettings(): Promise<ReferralSettings> {
    const tenantId = this.ctx.currentTenantId()!;
    const [row] = await this.ctx
      .db()
      .select({ discountPaise: tenants.referralDiscountPaise })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return { discountPaise: row?.discountPaise ?? null };
  }

  /** Set (or update) the tenant's referral discount amount. */
  async setSettings(discountPaise: number): Promise<ReferralSettings> {
    const tenantId = this.ctx.currentTenantId()!;
    await this.ctx
      .db()
      .update(tenants)
      .set({ referralDiscountPaise: discountPaise })
      .where(eq(tenants.id, tenantId));
    return { discountPaise };
  }

  /** Clear the discount → referrals stop qualifying (opt-out, not a delete of history). */
  async clearSettings(): Promise<ReferralSettings> {
    const tenantId = this.ctx.currentTenantId()!;
    await this.ctx
      .db()
      .update(tenants)
      .set({ referralDiscountPaise: null })
      .where(eq(tenants.id, tenantId));
    return { discountPaise: null };
  }

  /** Manager: every referral a resident has made (qualified + applied history). */
  async listForResident(residentId: string): Promise<ReferralSummary[]> {
    if (!residentId) return []; // no resident scope → nothing (never eq(col, undefined))
    const rows = await this.ctx
      .db()
      .select({
        id: referrals.id,
        referredResidentId: referrals.referredId,
        referredName: users.name,
        referredPhone: users.phone,
        discountPaise: referrals.discountPaise,
        qualifiedAt: referrals.qualifiedAt,
        appliedToInvoiceId: referrals.appliedToInvoiceId,
        appliedAt: referrals.appliedAt,
      })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredId))
      .where(eq(referrals.referrerId, residentId))
      .orderBy(desc(referrals.qualifiedAt));
    return rows.map((r) => ({
      id: r.id,
      referredResidentId: r.referredResidentId,
      referredName: r.referredName,
      referredPhone: r.referredPhone,
      discountPaise: r.discountPaise,
      qualifiedAt: r.qualifiedAt.toISOString(),
      appliedToInvoiceId: r.appliedToInvoiceId,
      appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
    }));
  }
}
