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
  invoices,
  payments,
  rentAdjustments,
  rooms,
  users,
} from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  assertAllowedType,
} from "../storage/storage.module";
import { istPeriod, istStartOfDayUtc } from "../common/ist-date";
import { prorateRent } from "./rent.proration";

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
   * for the period, priced from the resident's current room rent and PRORATED
   * for the join month (see `prorateRent`): a resident who joined mid-period is
   * billed only join-day..month-end; one whose `startDate` is after the period
   * is skipped entirely. Optionally scoped to `input.residentIds` (empty/omitted
   * = everyone). Idempotent: ON CONFLICT (resident_id, period) DO NOTHING, so
   * re-runs add only the missing ones. Used by both the manager endpoint and the
   * monthly job. Any queued, unapplied `rent_adjustments` for a resident (e.g. a
   * mid-month room-transfer delta) are folded into their new invoice here and
   * marked applied exactly once.
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

    const actives = await db
      .select({
        residentId: allocations.residentId,
        rent: rooms.monthlyRentPaise,
        startDate: allocations.startDate,
      })
      .from(allocations)
      .innerJoin(beds, eq(beds.id, allocations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(
        onlyResidents
          ? and(
              isNull(allocations.endDate),
              inArray(allocations.residentId, onlyResidents),
            )
          : isNull(allocations.endDate),
      );

    // Price each row, dropping residents who joined after the period (null).
    const rows = actives.flatMap((a) => {
      const amountPaise = prorateRent(a.rent, a.startDate, period);
      return amountPaise === null
        ? []
        : [
            {
              tenantId,
              residentId: a.residentId,
              period,
              amountPaise,
              dueDate,
              status: InvoiceStatus.PENDING,
            },
          ];
    });

    if (rows.length === 0) return { generated: 0, period };

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(invoices)
        .values(rows)
        .onConflictDoNothing({ target: [invoices.residentId, invoices.period] })
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
            inArray(
              rentAdjustments.residentId,
              inserted.map((i) => i.residentId),
            ),
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

      for (const inv of inserted) {
        const pending = pendingByResident.get(inv.residentId);
        if (!pending || pending.length === 0) continue;

        const sum = pending.reduce((s, a) => s + a.amountPaise, 0);
        const newTotal = inv.amountPaise + sum;

        await tx
          .update(rentAdjustments)
          .set({ appliedToInvoiceId: inv.id, appliedAt: new Date() })
          .where(
            inArray(
              rentAdjustments.id,
              pending.map((p) => p.id),
            ),
          );

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
    }));
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
            ),
          )
          .returning({ id: invoices.id });
        if (paid.length !== 1)
          throw new ConflictException("Invoice is already paid");
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
