import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  ChargeFrequency,
  type CreateExtraChargeInput,
  type ExtraChargeSummary,
  type InvoiceCharge,
  InvoiceStatus,
  PaymentStatus,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  extraCharges,
  invoiceCharges,
  invoices,
  payments,
  referrals,
} from "../db/schema";
import { istPeriod } from "../common/ist-date";

/**
 * Manager/owner-authored extra charges on a resident (one-time or recurring
 * monthly). RLS isolates tenants; the manager legitimately acts across residents
 * within the tenant, so `residentId` is a body TARGET while the creator id comes
 * from the JWT `sub`. The actual billing fold happens here (apply-now) and in
 * `RentService.generateMonthly` (the monthly run) — never double-applied.
 */
@Injectable()
export class ChargesService {
  constructor(private readonly ctx: TenantContextService) {}

  /**
   * Create a charge and, when possible, apply it to the resident's CURRENT open
   * invoice immediately. Apply-now is deliberately skipped when that invoice
   * already has a SUBMITTED payment in flight: approval settles the invoice
   * without reconciling its amount, so bumping it would leave the delta silently
   * uncollected. In that case (or when there's no open current invoice) the
   * charge waits for the next monthly generation.
   */
  async create(
    managerId: string,
    input: CreateExtraChargeInput,
  ): Promise<{ id: string; appliedToInvoiceId: string | null }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    const period = istPeriod(new Date());

    return db.transaction(async (tx) => {
      const [charge] = await tx
        .insert(extraCharges)
        .values({
          tenantId,
          residentId: input.residentId, // target (manager acts cross-resident)
          label: input.label,
          amountPaise: input.amountPaise,
          frequency: input.frequency,
          createdByUserId: managerId, // actor from JWT sub
        })
        .returning({ id: extraCharges.id });

      // The resident's current-period invoice, if any.
      const [invoice] = await tx
        .select({
          id: invoices.id,
          status: invoices.status,
          deletedAt: invoices.deletedAt,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.residentId, input.residentId),
            eq(invoices.period, period),
          ),
        );

      const open =
        invoice &&
        !invoice.deletedAt && // never fold a charge onto a voided invoice
        (invoice.status === InvoiceStatus.PENDING ||
          invoice.status === InvoiceStatus.OVERDUE);

      let appliedToInvoiceId: string | null = null;
      if (open) {
        const [pendingPayment] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.invoiceId, invoice.id),
              eq(payments.status, PaymentStatus.SUBMITTED),
            ),
          );

        if (!pendingPayment) {
          // Conditional-flip bump: only an unsettled invoice absorbs the charge.
          const bumped = await tx
            .update(invoices)
            .set({
              // `amount + delta` as SQL — no read-modify-write race.
              amountPaise: sql`${invoices.amountPaise} + ${input.amountPaise}`,
            })
            .where(
              and(
                eq(invoices.id, invoice.id),
                eq(invoices.status, invoice.status),
                isNull(invoices.deletedAt),
              ),
            )
            .returning({ id: invoices.id });

          if (bumped.length === 1) {
            await tx.insert(invoiceCharges).values({
              tenantId,
              invoiceId: invoice.id,
              chargeId: charge.id,
              residentId: input.residentId,
              label: input.label,
              amountPaise: input.amountPaise,
              period,
            });
            appliedToInvoiceId = invoice.id;
            // A one-time charge is now spent; stamp it so the monthly run skips it.
            if (input.frequency === ChargeFrequency.ONE_TIME) {
              await tx
                .update(extraCharges)
                .set({ appliedToInvoiceId: invoice.id, appliedAt: new Date() })
                .where(eq(extraCharges.id, charge.id));
            }
          }
        }
      }

      return { id: charge.id, appliedToInvoiceId };
    });
  }

  /** Manager: every charge defined for a resident (active + history). */
  async listForResident(residentId: string): Promise<ExtraChargeSummary[]> {
    if (!residentId) return []; // no resident scope → nothing (never eq(col, undefined))
    const rows = await this.ctx
      .db()
      .select()
      .from(extraCharges)
      .where(eq(extraCharges.residentId, residentId))
      .orderBy(desc(extraCharges.createdAt));
    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      label: r.label,
      amountPaise: r.amountPaise,
      frequency: r.frequency as ChargeFrequency,
      active: r.active,
      appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Stop a recurring charge from applying to future months. Soft-deactivate (a
   * conditional flip guarded on `active`) — NEVER a hard delete: the past
   * `invoice_charges` it produced must survive so already-billed invoice totals
   * keep reconciling against their breakdown.
   */
  async remove(id: string): Promise<{ active: false }> {
    const updated = await this.ctx
      .db()
      .update(extraCharges)
      .set({ active: false })
      .where(and(eq(extraCharges.id, id), eq(extraCharges.active, true)))
      .returning({ id: extraCharges.id });
    if (updated.length !== 1) {
      const [exists] = await this.ctx
        .db()
        .select({ id: extraCharges.id })
        .from(extraCharges)
        .where(eq(extraCharges.id, id));
      if (!exists) throw new NotFoundException("Charge not found");
      // Already inactive — idempotent no-op.
    }
    return { active: false };
  }

  /**
   * The labelled charge breakdown for one invoice. Managers read any in-tenant
   * invoice's charges; a resident is scoped to their own (RLS isolates tenants,
   * not residents — so we filter by resident id from the JWT).
   *
   * Also merges in any referral discount applied to this invoice — refer &
   * earn deliberately does NOT get its own `invoice_charges` row (that table
   * is hard-wired to `extra_charges` as its parent); instead it's folded into
   * the same breakdown shape here so it shows up on the existing resident
   * invoice-detail UI for free, as a negative ("Referral discount") line.
   */
  async listForInvoice(
    invoiceId: string,
    residentId?: string,
  ): Promise<InvoiceCharge[]> {
    const where = residentId
      ? and(
          eq(invoiceCharges.invoiceId, invoiceId),
          eq(invoiceCharges.residentId, residentId),
        )
      : eq(invoiceCharges.invoiceId, invoiceId);
    const rows = await this.ctx
      .db()
      .select()
      .from(invoiceCharges)
      .where(where)
      .orderBy(invoiceCharges.createdAt);
    const charges: InvoiceCharge[] = rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      label: r.label,
      amountPaise: r.amountPaise,
      period: r.period,
      createdAt: r.createdAt.toISOString(),
    }));

    const referralWhere = residentId
      ? and(
          eq(referrals.appliedToInvoiceId, invoiceId),
          eq(referrals.referrerId, residentId),
        )
      : eq(referrals.appliedToInvoiceId, invoiceId);
    const referralRows = await this.ctx
      .db()
      .select({
        id: referrals.id,
        discountPaise: referrals.discountPaise,
        appliedAt: referrals.appliedAt,
        qualifiedAt: referrals.qualifiedAt,
        period: invoices.period,
      })
      .from(referrals)
      .innerJoin(invoices, eq(invoices.id, referrals.appliedToInvoiceId))
      .where(referralWhere);
    const referralCharges: InvoiceCharge[] = referralRows.map((r) => ({
      id: r.id,
      invoiceId,
      label: "Referral discount",
      amountPaise: -r.discountPaise,
      period: r.period,
      createdAt: (r.appliedAt ?? r.qualifiedAt).toISOString(),
    }));

    return [...charges, ...referralCharges].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }
}
