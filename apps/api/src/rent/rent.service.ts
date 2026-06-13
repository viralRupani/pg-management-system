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
  rooms,
  users,
} from "../db/schema";
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  assertAllowedType,
} from "../storage/storage.module";
import { istPeriod } from "../common/ist-date";
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
   * monthly job.
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

    const inserted = await db
      .insert(invoices)
      .values(rows)
      .onConflictDoNothing({ target: [invoices.residentId, invoices.period] })
      .returning({ id: invoices.id });

    return { generated: inserted.length, period };
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

    // Default order: PENDING invoices first (what still needs collecting), then
    // newest period / most-recently created. The CASE keys only PENDING to the
    // top; everything settled (PAID/WAIVED/OVERDUE) follows, still date-sorted.
    const pendingFirst = sql`case when ${invoices.status} = ${InvoiceStatus.PENDING} then 0 else 1 end`;
    const [rows, [{ total }]] = await Promise.all([
      (where ? listBase.where(where) : listBase)
        .orderBy(pendingFirst, desc(invoices.period), desc(invoices.createdAt))
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
    // A settled invoice takes no further payments — blocks piling SUBMITTED rows
    // onto an already-PAID invoice.
    if (invoice.status === InvoiceStatus.PAID)
      throw new ConflictException("Invoice is already paid");
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

      // (2) The invoice PENDING -> PAID flip is the authoritative single-settle
      // guard: a second approval (even for a different SUBMITTED payment on the
      // same invoice) matches 0 rows here and rolls the whole txn back, so an
      // invoice can never carry two APPROVED payments.
      if (decision === PaymentStatus.APPROVED) {
        const paid = await tx
          .update(invoices)
          .set({ status: InvoiceStatus.PAID })
          .where(
            and(
              eq(invoices.id, decided[0].invoiceId),
              eq(invoices.status, InvoiceStatus.PENDING),
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
