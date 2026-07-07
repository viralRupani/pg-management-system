import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  type GenerateInvoicesInput,
  type InvoiceListQuery,
  type InvoiceListResult,
  type InvoiceSummary,
  InvoiceStatus,
  PaymentMethod,
  type PaymentSummary,
  PaymentStatus,
  type PresignedUploadResult,
  type SubmitPaymentInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  beds,
  extraCharges,
  invoiceCharges,
  invoices,
  payments,
  rentAdjustments,
  rooms,
  users,
} from "../db/schema";
import { ChargeFrequency } from "@pg/shared";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  assertAllowedType,
} from "../storage/storage.module";
import { istPeriod, istStartOfDayUtc } from "../common/ist-date";
import { prorateSegment } from "./rent.proration";

/**
 * The rent loop. RLS isolates tenants; it does NOT isolate residents within a
 * tenant — so every resident-facing method takes the caller's user id (from the
 * JWT `sub`, never the body) and filters/owns by it. Manager methods may see all
 * of the tenant's rows.
 */
@Injectable()
export class RentService {
  constructor(
    private readonly ctx: TenantContextService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Generate one PENDING invoice per active (currently bed-allocated) resident
   * for the period. The amount is the SUM of every allocation SEGMENT that
   * resident occupied during the month (see `prorateSegment`): a resident who
   * stayed put has one open segment (full month, or join-day..month-end for the
   * join month); a resident who transferred rooms mid-month has the old room
   * (start..moveDay) plus the new room (moveDay..month-end), so a re-generated
   * invoice prices the WHOLE month correctly rather than just the post-move
   * remainder. A resident whose active allocation begins in a LATER month is
   * skipped entirely (no invoice). Optionally scoped to `input.residentIds`
   * (empty/omitted = everyone). Idempotent: residents who already have a live
   * (non-voided) invoice this period are skipped, so re-runs add only the
   * missing ones. Used by both the manager endpoint and the monthly job. Any
   * queued, unapplied `rent_adjustments` for a resident (e.g. a mid-month
   * room-transfer delta against an already-billed invoice) are folded into their
   * new invoice here and marked applied exactly once.
   */
  async generateMonthly(
    input: GenerateInvoicesInput,
  ): Promise<{ generated: number; period: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    // Default to the CURRENT period in IST — the same clock the join-month
    // comparison uses (see prorateRent). A UTC default would disagree with it at
    // the month boundary (the monthly cron fires 02:00 IST on the 1st = the
    // PREVIOUS day in UTC), billing the wrong month.
    const period = input.period ?? istPeriod(new Date());
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : new Date(`${period}-10T00:00:00Z`);
    const onlyResidents = input.residentIds?.length
      ? input.residentIds
      : undefined;

    // Billable = residents with an ACTIVE (open) allocation right now. (A fully
    // moved-out resident has no open allocation and is not billed.) We also keep
    // each one's active-allocation start to decide billability for the join month.
    const actives = await db
      .select({
        residentId: allocations.residentId,
        startDate: allocations.startDate,
      })
      .from(allocations)
      .where(
        onlyResidents
          ? and(
              isNull(allocations.endDate),
              inArray(allocations.residentId, onlyResidents),
            )
          : isNull(allocations.endDate),
      );
    const activeStartByResident = new Map(
      actives.map((a) => [a.residentId, a.startDate]),
    );
    const billableIds = [...activeStartByResident.keys()];
    if (billableIds.length === 0) return { generated: 0, period };

    // Every allocation segment for the billable residents (old + active). A
    // mid-month transfer leaves an ENDED old segment plus the active new one;
    // summing their prorated portions bills the whole month. Non-overlapping
    // segments contribute 0 (prorateSegment handles it), so no date filter here.
    const segs = await db
      .select({
        residentId: allocations.residentId,
        rent: rooms.monthlyRentPaise,
        startDate: allocations.startDate,
        endDate: allocations.endDate,
      })
      .from(allocations)
      .innerJoin(beds, eq(beds.id, allocations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(inArray(allocations.residentId, billableIds));
    const segsByResident = new Map<
      string,
      { rent: number; startDate: Date; endDate: Date | null }[]
    >();
    for (const s of segs) {
      const list = segsByResident.get(s.residentId);
      if (list) list.push(s);
      else segsByResident.set(s.residentId, [s]);
    }

    const rows = billableIds.flatMap((residentId) => {
      // Active allocation begins in a LATER month than the period → not yet
      // billable (matches the old prorateRent null for a future joiner/booking).
      if (istPeriod(activeStartByResident.get(residentId)!) > period) return [];
      const amountPaise = (segsByResident.get(residentId) ?? []).reduce(
        (sum, s) => sum + prorateSegment(s.rent, s.startDate, s.endDate, period),
        0,
      );
      if (amountPaise <= 0) return []; // no occupied days this period
      return [
        {
          tenantId,
          residentId,
          period,
          amountPaise,
          dueDate,
          status: InvoiceStatus.PENDING,
        },
      ];
    });

    if (rows.length === 0) return { generated: 0, period };

    return db.transaction(async (tx) => {
      // Skip residents who already have a live (non-voided) invoice this period.
      // This replaces ON CONFLICT DO NOTHING, which cannot reference a partial
      // unique index. A voided invoice (deleted_at IS NOT NULL) is excluded from
      // the index, so those residents ARE eligible for a fresh invoice here.
      const existingActive = await tx
        .select({ residentId: invoices.residentId })
        .from(invoices)
        .where(
          and(
            inArray(
              invoices.residentId,
              rows.map((r) => r.residentId),
            ),
            eq(invoices.period, period),
            isNull(invoices.deletedAt),
          ),
        );
      const billedSet = new Set(existingActive.map((r) => r.residentId));
      const newRows = rows.filter((r) => !billedSet.has(r.residentId));

      if (newRows.length === 0) return { generated: 0, period };

      const inserted = await tx
        .insert(invoices)
        .values(newRows)
        .onConflictDoNothing() // safety net for concurrent requests
        .returning({
          id: invoices.id,
          residentId: invoices.residentId,
          amountPaise: invoices.amountPaise,
        });

      // Fold each resident's queued, unapplied rent adjustments (e.g. a mid-month
      // room-transfer delta — signed, may be a credit) into their brand-new
      // invoice, consuming each adjustment exactly once. Only invoices we just
      // inserted are touched (ON CONFLICT skips residents already billed this
      // period), so a re-run never double-applies. If a credit drives the total
      // below zero, the invoice settles at 0 (nothing to collect) and the
      // remainder carries forward as a fresh adjustment.
      //
      // Read every inserted resident's pending adjustments in ONE query (not one
      // per invoice), then group in memory and key by resident — each inserted
      // invoice has a unique residentId (ON CONFLICT on resident_id+period, one
      // period), so the map is unambiguous. The remaining writes run only for
      // residents who actually have adjustments.
      const residentIds = inserted.map((i) => i.residentId);
      const pendingByResident = new Map<
        string,
        { id: string; amountPaise: number }[]
      >();
      const allPending = await tx
        .select({
          id: rentAdjustments.id,
          residentId: rentAdjustments.residentId,
          amountPaise: rentAdjustments.amountPaise,
        })
        .from(rentAdjustments)
        .where(
          and(
            inArray(rentAdjustments.residentId, residentIds),
            isNull(rentAdjustments.appliedToInvoiceId),
          ),
        );
      for (const a of allPending) {
        const list = pendingByResident.get(a.residentId);
        if (list) list.push({ id: a.id, amountPaise: a.amountPaise });
        else
          pendingByResident.set(a.residentId, [
            { id: a.id, amountPaise: a.amountPaise },
          ]);
      }

      // Manager/owner-authored extra charges fold in the SAME way — added into
      // each invoice's total (and recorded as an `invoice_charges` line for the
      // breakdown). One ONE_TIME charge is consumed once (filtered on
      // applied_at IS NULL here, stamped applied below); every active MONTHLY
      // charge recurs each run. Folding charges into `newTotal` alongside the
      // signed adjustments means a carried-forward credit correctly offsets a
      // charge before any carry-forward is recomputed.
      const chargesByResident = new Map<
        string,
        { id: string; label: string; amountPaise: number; oneTime: boolean }[]
      >();
      const allCharges = await tx
        .select({
          id: extraCharges.id,
          residentId: extraCharges.residentId,
          label: extraCharges.label,
          amountPaise: extraCharges.amountPaise,
          frequency: extraCharges.frequency,
        })
        .from(extraCharges)
        .where(
          and(
            inArray(extraCharges.residentId, residentIds),
            eq(extraCharges.active, true),
            or(
              eq(extraCharges.frequency, ChargeFrequency.MONTHLY),
              and(
                eq(extraCharges.frequency, ChargeFrequency.ONE_TIME),
                isNull(extraCharges.appliedToInvoiceId),
              ),
            ),
          ),
        );
      for (const c of allCharges) {
        const entry = {
          id: c.id,
          label: c.label,
          amountPaise: c.amountPaise,
          oneTime: c.frequency === ChargeFrequency.ONE_TIME,
        };
        const list = chargesByResident.get(c.residentId);
        if (list) list.push(entry);
        else chargesByResident.set(c.residentId, [entry]);
      }

      for (const inv of inserted) {
        const pending = pendingByResident.get(inv.residentId) ?? [];
        const charges = chargesByResident.get(inv.residentId) ?? [];
        if (pending.length === 0 && charges.length === 0) continue;

        const adjSum = pending.reduce((s, a) => s + a.amountPaise, 0);
        const chargeSum = charges.reduce((s, c) => s + c.amountPaise, 0);
        const newTotal = inv.amountPaise + adjSum + chargeSum;

        if (pending.length > 0) {
          await tx
            .update(rentAdjustments)
            .set({ appliedToInvoiceId: inv.id, appliedAt: new Date() })
            .where(
              inArray(
                rentAdjustments.id,
                pending.map((p) => p.id),
              ),
            );
        }

        if (charges.length > 0) {
          // unique(charge_id, period) keeps a re-run from double-recording a
          // monthly charge for the same month.
          await tx
            .insert(invoiceCharges)
            .values(
              charges.map((c) => ({
                tenantId,
                invoiceId: inv.id,
                chargeId: c.id,
                residentId: inv.residentId,
                label: c.label,
                amountPaise: c.amountPaise,
                period,
              })),
            )
            .onConflictDoNothing({
              target: [invoiceCharges.chargeId, invoiceCharges.period],
            });
          const oneTimeIds = charges
            .filter((c) => c.oneTime)
            .map((c) => c.id);
          if (oneTimeIds.length > 0) {
            await tx
              .update(extraCharges)
              .set({ appliedToInvoiceId: inv.id, appliedAt: new Date() })
              .where(inArray(extraCharges.id, oneTimeIds));
          }
        }

        if (newTotal >= 0) {
          await tx
            .update(invoices)
            .set({ amountPaise: newTotal })
            .where(eq(invoices.id, inv.id));
        } else {
          // Fully credited: settle at 0 and carry the leftover credit forward.
          await tx
            .update(invoices)
            .set({ amountPaise: 0, status: InvoiceStatus.PAID })
            .where(eq(invoices.id, inv.id));
          await tx.insert(rentAdjustments).values({
            tenantId,
            residentId: inv.residentId,
            amountPaise: newTotal,
            description: `Credit carried forward from ${period}`,
            source: "CARRY_FORWARD",
            period,
          });
        }
      }

      return { generated: inserted.length, period };
    });
  }

  /**
   * Flip every still-PENDING invoice whose due date has fully passed to OVERDUE.
   * "Past due" is day-granular in IST: an invoice due on the 10th becomes overdue
   * once the 11th begins in IST (see `istStartOfDayUtc`) — comparing the stored
   * UTC `due_date` to raw `now()` would flip it ~5.5h early. A side-effect-free
   * bulk relabel (no money moves), so it's a plain conditional UPDATE, not the
   * single-entity 409 conditional-flip pattern. Idempotent and re-runnable; only
   * PENDING rows are touched, so PAID/WAIVED/already-OVERDUE are left alone.
   * Optionally scoped to one `period`. Driven by the daily job.
   */
  async markOverdue(period?: string): Promise<{ flipped: number }> {
    const db = this.ctx.db();
    const cutoff = istStartOfDayUtc(new Date());
    const conds = [
      eq(invoices.status, InvoiceStatus.PENDING),
      isNull(invoices.deletedAt), // a voided invoice never becomes overdue
      sql`${invoices.dueDate} < ${cutoff}`,
    ];
    if (period) conds.push(eq(invoices.period, period));

    const flipped = await db
      .update(invoices)
      .set({ status: InvoiceStatus.OVERDUE })
      .where(and(...conds))
      .returning({ id: invoices.id });
    return { flipped: flipped.length };
  }

  /**
   * Manager: tenant invoices, newest period first, with search (resident name or
   * period, case-insensitive) + offset pagination. Both queries inner-join users
   * (the residentId FK is non-null, so the join never changes the count) so the
   * name filter is shared by the list and the count on one code path.
   */
  async listInvoices(query: InvoiceListQuery): Promise<InvoiceListResult> {
    const { q, residentId, page, limit } = query;
    const db = this.ctx.db();
    const filters = [
      q
        ? or(ilike(users.name, `%${q}%`), ilike(invoices.period, `%${q}%`))
        : undefined,
      residentId ? eq(invoices.residentId, residentId) : undefined,
    ].filter(Boolean);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const listBase = db
      .select({
        id: invoices.id,
        residentId: invoices.residentId,
        residentName: users.name,
        period: invoices.period,
        amountPaise: invoices.amountPaise,
        dueDate: invoices.dueDate,
        status: invoices.status,
        underReview: this.underReviewSql,
        deletedAt: invoices.deletedAt,
        deletedReason: invoices.deletedReason,
      })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.residentId));
    const countBase = db
      .select({ total: count() })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.residentId));

    // Default order: most-urgent-to-collect first — OVERDUE (past due, unpaid)
    // above PENDING, then everything settled (PAID/WAIVED) — and within each
    // bucket newest period / most-recently created. OVERDUE outranks PENDING
    // because it's the rent a manager most needs to chase.
    const collectFirst = sql`case
      when ${invoices.deletedAt} is not null then 3
      when ${invoices.status} = ${InvoiceStatus.OVERDUE} then 0
      when ${invoices.status} = ${InvoiceStatus.PENDING} then 1
      else 2 end`;
    const [rows, [{ total }]] = await Promise.all([
      (where ? listBase.where(where) : listBase)
        .orderBy(collectFirst, desc(invoices.period), desc(invoices.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      where ? countBase.where(where) : countBase,
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        residentId: r.residentId,
        residentName: r.residentName,
        period: r.period,
        amountPaise: r.amountPaise,
        dueDate: r.dueDate.toISOString(),
        status: r.status as InvoiceStatus,
        underReview: r.underReview,
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
        deletedReason: r.deletedReason,
      })),
      total,
      page,
      limit,
    };
  }

  /** Resident: only their own invoices. */
  async listMyInvoices(residentId: string): Promise<InvoiceSummary[]> {
    const rows = await this.ctx
      .db()
      .select({
        id: invoices.id,
        residentId: invoices.residentId,
        residentName: users.name,
        period: invoices.period,
        amountPaise: invoices.amountPaise,
        dueDate: invoices.dueDate,
        status: invoices.status,
        underReview: this.underReviewSql,
        deletedAt: invoices.deletedAt,
        deletedReason: invoices.deletedReason,
      })
      .from(invoices)
      .innerJoin(users, eq(users.id, invoices.residentId))
      .where(eq(invoices.residentId, residentId))
      .orderBy(desc(invoices.period));
    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      period: r.period,
      amountPaise: r.amountPaise,
      dueDate: r.dueDate.toISOString(),
      status: r.status as InvoiceStatus,
      underReview: r.underReview,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      deletedReason: r.deletedReason,
    }));
  }

  /**
   * Correlated subquery: does this invoice have a payment currently awaiting
   * review? A derived flag, not a stored invoice status — so a rejected payment
   * (SUBMITTED → REJECTED) automatically drops the invoice back to plain
   * PENDING/OVERDUE with no revert logic. Shared by the resident + manager list
   * mappers.
   */
  private readonly underReviewSql = sql<boolean>`exists (select 1 from ${payments} where ${payments.invoiceId} = ${invoices.id} and ${payments.status} = ${PaymentStatus.SUBMITTED})`;

  /**
   * Manager: void (soft-delete) an invoice with a mandatory reason. The invoice
   * stays in the list (shown cancelled, with the reason) but is no longer owed:
   * it can't be paid, overdue-marking skips it, and it drops out of totals.
   * Conditional flip on `deleted_at IS NULL` so a double-delete is a 409, not a
   * silent reason-overwrite. `status` is intentionally left as-is.
   */
  async deleteInvoice(
    invoiceId: string,
    managerId: string,
    reason: string,
  ): Promise<{ deletedAt: string }> {
    const voided = await this.ctx
      .db()
      .update(invoices)
      .set({
        deletedAt: new Date(),
        deletedReason: reason,
        deletedByUserId: managerId, // actor from JWT sub
      })
      .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)))
      .returning({
        deletedAt: invoices.deletedAt,
        residentId: invoices.residentId,
        period: invoices.period,
      });
    if (voided.length !== 1) {
      const [exists] = await this.ctx
        .db()
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.id, invoiceId));
      if (!exists) throw new NotFoundException("Invoice not found");
      throw new ConflictException("Invoice is already deleted");
    }
    const { residentId, period } = voided[0];

    const db = this.ctx.db();
    // Release resources so a re-generated invoice prices the month from scratch:
    // hard-delete line items (no independent audit value), and un-mark charges
    // and adjustments that were consumed by this now-voided invoice.
    await db.delete(invoiceCharges).where(eq(invoiceCharges.invoiceId, invoiceId));
    await db
      .update(extraCharges)
      .set({ appliedToInvoiceId: null, appliedAt: null })
      .where(eq(extraCharges.appliedToInvoiceId, invoiceId));
    await db
      .update(rentAdjustments)
      .set({ appliedToInvoiceId: null, appliedAt: null })
      .where(eq(rentAdjustments.appliedToInvoiceId, invoiceId));
    // Drop any still-PENDING transfer delta for THIS resident + month: re-generation
    // re-prices the whole month segment-aware (old room + new room), so keeping the
    // delta — which reconciled the now-voided full-old-room invoice — would
    // double-count. Scoped to TRANSFER + this period so real carry-forward credits
    // and other months are untouched.
    await db
      .delete(rentAdjustments)
      .where(
        and(
          eq(rentAdjustments.residentId, residentId),
          eq(rentAdjustments.period, period),
          eq(rentAdjustments.source, "TRANSFER"),
          isNull(rentAdjustments.appliedToInvoiceId),
        ),
      );

    return { deletedAt: voided[0].deletedAt!.toISOString() };
  }

  /** Resident: presigned URL to upload a screenshot for THEIR invoice. */
  async requestUploadUrl(
    residentId: string,
    invoiceId: string,
    contentType: string,
  ): Promise<PresignedUploadResult> {
    assertAllowedType("payments", contentType);
    await this.ownedInvoice(residentId, invoiceId);
    return this.storage.presignUpload({
      tenantId: this.ctx.currentTenantId()!,
      kind: "payments",
      contentType,
    });
  }

  /** Resident: submit a payment against THEIR invoice. */
  async submitPayment(
    residentId: string,
    input: SubmitPaymentInput,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const invoice = await this.ownedInvoice(residentId, input.invoiceId);
    // A voided (soft-deleted) invoice is no longer owed — reject any payment.
    if (invoice.deletedAt)
      throw new ConflictException("Invoice has been cancelled");
    // Only a payable invoice (PENDING or its past-due OVERDUE form) takes a
    // payment — blocks piling dead SUBMITTED rows onto an already-settled one
    // (PAID, or WAIVED where the manager forgave the rent so there's nothing to
    // collect). The manager approve path settles the same two states.
    if (
      invoice.status !== InvoiceStatus.PENDING &&
      invoice.status !== InvoiceStatus.OVERDUE
    )
      throw new ConflictException(
        `Invoice is already ${invoice.status.toLowerCase()}`,
      );
    const [row] = await this.ctx
      .db()
      .insert(payments)
      .values({
        tenantId,
        invoiceId: input.invoiceId,
        residentId, // from JWT sub, never the body
        amountPaise: input.amountPaise ?? invoice.amountPaise,
        method: input.method,
        screenshotKey: input.screenshotKey ?? null,
        referenceId: input.referenceId ?? null,
        status: PaymentStatus.SUBMITTED,
      })
      .returning({ id: payments.id });
    return { id: row.id };
  }

  /** Manager: payments awaiting/holding review (optionally filtered by status). */
  async listPayments(status?: PaymentStatus): Promise<PaymentSummary[]> {
    const db = this.ctx.db();
    const base = db
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        residentId: payments.residentId,
        residentName: users.name,
        period: invoices.period,
        amountPaise: payments.amountPaise,
        status: payments.status,
        method: payments.method,
        reviewNote: payments.reviewNote,
        referenceId: payments.referenceId,
        screenshotKey: payments.screenshotKey,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(users, eq(users.id, payments.residentId))
      .orderBy(desc(payments.createdAt));
    const rows = status
      ? await base.where(eq(payments.status, status))
      : await base;
    return rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      residentId: r.residentId,
      residentName: r.residentName,
      period: r.period,
      amountPaise: r.amountPaise,
      status: r.status as PaymentStatus,
      method: r.method as PaymentMethod,
      reviewNote: r.reviewNote,
      referenceId: r.referenceId,
      hasScreenshot: Boolean(r.screenshotKey),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Manager: presigned download URL for a payment's screenshot. */
  async getScreenshotUrl(paymentId: string): Promise<{ downloadUrl: string }> {
    const [p] = await this.ctx
      .db()
      .select({ key: payments.screenshotKey })
      .from(payments)
      .where(eq(payments.id, paymentId));
    if (!p) throw new NotFoundException("Payment not found");
    if (!p.key)
      throw new NotFoundException("This payment has no screenshot");
    return this.storage.presignDownload(p.key);
  }

  /** Manager: approve a SUBMITTED payment -> invoice PAID. */
  async approvePayment(
    paymentId: string,
    reviewerId: string,
  ): Promise<{ status: PaymentStatus }> {
    return this.reviewPayment(paymentId, reviewerId, PaymentStatus.APPROVED);
  }

  /** Manager: reject a SUBMITTED payment with a note (invoice stays unpaid). */
  async rejectPayment(
    paymentId: string,
    reviewerId: string,
    note: string,
  ): Promise<{ status: PaymentStatus }> {
    return this.reviewPayment(
      paymentId,
      reviewerId,
      PaymentStatus.REJECTED,
      note,
    );
  }

  private async reviewPayment(
    paymentId: string,
    reviewerId: string,
    decision: typeof PaymentStatus.APPROVED | typeof PaymentStatus.REJECTED,
    note?: string,
  ): Promise<{ status: PaymentStatus }> {
    const db = this.ctx.db();
    return db.transaction(async (tx) => {
      // (1) Conditional flip FIRST: only a SUBMITTED payment can be decided.
      // A concurrent/repeat review matches 0 rows and bails before any side
      // effect — not select-then-update, which races under READ COMMITTED.
      const decided = await tx
        .update(payments)
        .set({
          status: decision,
          reviewedByUserId: reviewerId,
          reviewNote: note ?? null,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.status, PaymentStatus.SUBMITTED),
          ),
        )
        .returning({ invoiceId: payments.invoiceId });

      if (decided.length !== 1) {
        const [exists] = await tx
          .select({ status: payments.status })
          .from(payments)
          .where(eq(payments.id, paymentId));
        if (!exists) throw new NotFoundException("Payment not found");
        throw new ConflictException(
          `Payment already ${exists.status.toLowerCase()}`,
        );
      }

      // (2) The invoice {PENDING,OVERDUE} -> PAID flip is the authoritative
      // single-settle guard: a second approval (even for a different SUBMITTED
      // payment on the same invoice) matches 0 rows here and rolls the whole txn
      // back, so an invoice can never carry two APPROVED payments. OVERDUE is an
      // unpaid state too (a past-due PENDING invoice), so it must settle the same
      // way — otherwise late payers could never be marked paid. PAID/WAIVED stay
      // excluded, preserving the single-settle invariant.
      if (decision === PaymentStatus.APPROVED) {
        const paid = await tx
          .update(invoices)
          .set({ status: InvoiceStatus.PAID })
          .where(
            and(
              eq(invoices.id, decided[0].invoiceId),
              inArray(invoices.status, [
                InvoiceStatus.PENDING,
                InvoiceStatus.OVERDUE,
              ]),
              // A voided invoice is no longer owed — approving a payment that was
              // submitted before the void must NOT resurrect it to PAID. The
              // shared txn rolls back, leaving the payment SUBMITTED (same guard
              // shape as the single-settle invariant above).
              isNull(invoices.deletedAt),
            ),
          )
          .returning({ id: invoices.id });
        if (paid.length !== 1)
          throw new ConflictException("Invoice is already paid or cancelled");
      }
      return { status: decision };
    });
  }

  /** Fetch an invoice that belongs to this resident, or 404. */
  private async ownedInvoice(residentId: string, invoiceId: string) {
    const [inv] = await this.ctx
      .db()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.id, invoiceId), eq(invoices.residentId, residentId)),
      );
    if (!inv) throw new NotFoundException("Invoice not found");
    return inv;
  }
}
