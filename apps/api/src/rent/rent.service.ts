import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  type GenerateInvoicesInput,
  type InvoiceSummary,
  InvoiceStatus,
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
   * for the period, priced from the resident's current room rent. Idempotent:
   * ON CONFLICT (resident_id, period) DO NOTHING, so re-runs add only the
   * missing ones. Used by both the manager endpoint and the monthly job.
   */
  async generateMonthly(
    input: GenerateInvoicesInput,
  ): Promise<{ generated: number; period: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    const period = input.period ?? new Date().toISOString().slice(0, 7);
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : new Date(`${period}-10T00:00:00Z`);

    const actives = await db
      .select({
        residentId: allocations.residentId,
        rent: rooms.monthlyRentPaise,
      })
      .from(allocations)
      .innerJoin(beds, eq(beds.id, allocations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(isNull(allocations.endDate));

    if (actives.length === 0) return { generated: 0, period };

    const inserted = await db
      .insert(invoices)
      .values(
        actives.map((a) => ({
          tenantId,
          residentId: a.residentId,
          period,
          amountPaise: a.rent,
          dueDate,
          status: InvoiceStatus.PENDING,
        })),
      )
      .onConflictDoNothing({ target: [invoices.residentId, invoices.period] })
      .returning({ id: invoices.id });

    return { generated: inserted.length, period };
  }

  /** Manager: all invoices in the tenant, newest period first. */
  async listInvoices(): Promise<InvoiceSummary[]> {
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
