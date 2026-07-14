import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  type ApplyDepositToInvoiceResult,
  BookingStatus,
  type CollectDepositInput,
  type DepositSummary,
  DepositStatus,
  type DepositTransactionSummary,
  DepositTxnType,
  type ExitDecisionInput,
  type ExitEffective,
  type ExitPending,
  ExitPendingType,
  type ExitRequestInput,
  type ExitRequestSummary,
  type ExitSettlementInput,
  InvoiceStatus,
  PaymentStatus,
  type RecordDepositInput,
  type RefundDepositInput,
  ResidentStatus,
  type SettlementResult,
  type UpdateDepositAmountInput,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  bookings,
  depositTransactions,
  deposits,
  invoices,
  payments,
  users,
} from "../db/schema";
import { freeBed } from "../db/free-bed";
import { isUniqueViolation } from "../db/pg-errors";
import { addMonthsToPeriod } from "../common/ist-date";
import { sumOutflows } from "./deposit-ledger";
import { settleInvoiceFromDepositIfEligible } from "./settle-invoice-from-deposit";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/**
 * Security deposits + exit settlement. The settlement is the load-bearing flow:
 * it has irreversible side effects (free bed, mark EXITED, write a REFUND), so
 * it is guarded by a CONDITIONAL status flip on the always-present entity (the
 * resident: ACTIVE -> EXITED) BEFORE any side effect. A concurrent second call
 * flips 0 rows and bails with 409, so nothing double-settles. The ledger
 * invariant `held = Σoutflows (deductions + refunds) + finalRefund` is
 * enforced by rejecting over-deductions. Refunds aren't exit-only — a manager
 * can record one any time the deposit is HELD (e.g. a room downgrade), which
 * is why "outflows" covers both DEDUCTION and REFUND.
 */
@Injectable()
export class DepositsService {
  constructor(private readonly ctx: TenantContextService) {}

  /** Manager: record a resident's deposit (one per resident). Also logs the
   * amount as the deposit's first COLLECTION so the ledger is complete from
   * the start, whether the rest is added later via `collect()` or not. */
  async record(
    input: RecordDepositInput,
    managerId: string,
  ): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();
    const [resident] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.residentId),
          eq(users.role, UserRole.RESIDENT),
        ),
      );
    if (!resident) throw new NotFoundException("Resident not found");

    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(deposits)
          .values({
            tenantId,
            residentId: input.residentId,
            amountPaise: input.amountPaise,
            status: DepositStatus.HELD,
          })
          .returning({ id: deposits.id });
        await tx.insert(depositTransactions).values({
          tenantId,
          depositId: row.id,
          type: DepositTxnType.COLLECTION,
          amountPaise: input.amountPaise,
          createdByUserId: managerId,
        });
        return { id: row.id };
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException("Deposit already recorded for this resident");
      throw err;
    }
  }

  /**
   * Manager: set a resident's held deposit to a new amount (e.g. top it up on a
   * transfer to a pricier room so it still covers a month's rent). Creates the
   * deposit if none exists yet. Locks the row (FOR UPDATE) so a concurrent
   * `applyToInvoice`/`settleExit` can't read a stale balance, and rejects a new
   * amount below what's already been deducted (which would drive `available`
   * negative). The held base changes without a ledger entry — the settle
   * invariant `held = Σdeductions + refund` still holds.
   */
  async updateAmount(
    input: UpdateDepositAmountInput,
  ): Promise<{ amountPaise: number }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    return db.transaction(async (tx) => {
      const [resident] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.residentId),
            eq(users.role, UserRole.RESIDENT),
          ),
        );
      if (!resident) throw new NotFoundException("Resident not found");

      const [deposit] = await tx
        .select({
          id: deposits.id,
          status: deposits.status,
        })
        .from(deposits)
        .where(eq(deposits.residentId, input.residentId))
        .for("update");

      // Create-if-missing: a resident registered without a deposit can have one
      // recorded here (the transfer flow may be the first time it's set).
      if (!deposit) {
        await tx.insert(deposits).values({
          tenantId,
          residentId: input.residentId,
          amountPaise: input.amountPaise,
          status: DepositStatus.HELD,
        });
        return { amountPaise: input.amountPaise };
      }

      if (deposit.status !== DepositStatus.HELD)
        throw new ConflictException(
          "Deposit is already settled and can't be changed",
        );

      // Can't drop the held base below what's already gone out — that would
      // make the available balance (held − outflows) negative.
      const prior = await sumOutflows(tx, deposit.id);
      if (input.amountPaise < prior)
        throw new ConflictException(
          "New deposit can't be below the amount already applied to rent",
        );

      await tx
        .update(deposits)
        .set({ amountPaise: input.amountPaise })
        .where(eq(deposits.id, deposit.id));
      return { amountPaise: input.amountPaise };
    });
  }

  /** Manager: all deposits in the tenant. */
  async listAll(): Promise<DepositSummary[]> {
    const rows = await this.ctx
      .db()
      .select({
        id: deposits.id,
        residentId: deposits.residentId,
        residentName: users.name,
        amountPaise: deposits.amountPaise,
        status: deposits.status,
      })
      .from(deposits)
      .innerJoin(users, eq(users.id, deposits.residentId));
    return rows.map((r) => ({
      id: r.id,
      residentId: r.residentId,
      residentName: r.residentName,
      amountPaise: r.amountPaise,
      status: r.status as DepositStatus,
    }));
  }

  /**
   * A resident's deposit + exit ledger. Used by the manager (any resident) and
   * the resident (own — pass sub). RLS scopes the tenant; the residentId filter
   * scopes the resident.
   */
  async getForResident(residentId: string): Promise<{
    deposit: DepositSummary | null;
    availablePaise: number;
    ledger: DepositTransactionSummary[];
    exitRequest: ExitRequestSummary | null;
  }> {
    const db = this.ctx.db();

    // The resident always exists (even before a deposit is recorded); read the
    // user row first so a pending move-out request surfaces with no deposit.
    const [resident] = await db
      .select({
        name: users.name,
        exitRequestedDate: users.exitRequestedDate,
        exitRequestNote: users.exitRequestNote,
        exitRequestedAt: users.exitRequestedAt,
        exitPendingType: users.exitPendingType,
        exitPendingDate: users.exitPendingDate,
        exitPendingNote: users.exitPendingNote,
        exitPendingAt: users.exitPendingAt,
      })
      .from(users)
      .where(
        and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
      );

    const effective: ExitEffective | null =
      resident?.exitRequestedAt && resident.exitRequestedDate
        ? {
            date: resident.exitRequestedDate,
            note: resident.exitRequestNote,
            at: resident.exitRequestedAt.toISOString(),
          }
        : null;

    const pending: ExitPending | null =
      resident?.exitPendingType && resident.exitPendingAt
        ? {
            type: resident.exitPendingType as ExitPendingType,
            date: resident.exitPendingDate,
            note: resident.exitPendingNote,
            at: resident.exitPendingAt.toISOString(),
          }
        : null;

    // Back-compat flat fields (apps/mobile): whichever is "live" — a pending
    // action if one exists (a CANCEL has no date of its own, so it falls back
    // to the effective date it would clear), else the approved request.
    const live = pending
      ? {
          date: pending.date ?? effective?.date ?? null,
          note: pending.note,
          at: pending.at,
        }
      : effective;

    const exitRequest: ExitRequestSummary | null = live?.date
      ? {
          requestedDate: live.date,
          note: live.note,
          requestedAt: live.at,
          effective,
          pending,
          bookingConflict: await this.hasPendingBookingOnCurrentBed(
            db,
            residentId,
          ),
        }
      : null;

    const [row] = await db
      .select({
        id: deposits.id,
        amountPaise: deposits.amountPaise,
        status: deposits.status,
      })
      .from(deposits)
      .where(eq(deposits.residentId, residentId));

    if (!row) return { deposit: null, availablePaise: 0, ledger: [], exitRequest };

    const availablePaise = row.amountPaise - (await sumOutflows(db, row.id));

    const txns = await db
      .select({
        id: depositTransactions.id,
        type: depositTransactions.type,
        reason: depositTransactions.reason,
        amountPaise: depositTransactions.amountPaise,
        invoiceId: depositTransactions.invoiceId,
        period: invoices.period,
        createdAt: depositTransactions.createdAt,
      })
      .from(depositTransactions)
      .leftJoin(invoices, eq(invoices.id, depositTransactions.invoiceId))
      .where(eq(depositTransactions.depositId, row.id));

    return {
      deposit: {
        id: row.id,
        residentId,
        residentName: resident?.name ?? "",
        amountPaise: row.amountPaise,
        status: row.status as DepositStatus,
      },
      availablePaise,
      ledger: txns.map((t) => ({
        id: t.id,
        type: t.type as DepositTxnType,
        reason: t.reason,
        amountPaise: t.amountPaise,
        invoiceId: t.invoiceId,
        period: t.period,
        createdAt: t.createdAt.toISOString(),
      })),
      exitRequest,
    };
  }

  /**
   * Manager: settle a rent invoice from the resident's held deposit ("use my
   * deposit for this month's rent"). Records a DEDUCTION tied to the invoice and
   * flips the invoice PAID in one transaction — the conditional flip makes a
   * double-apply 409 instead of double-charging. The deposit stays HELD; its
   * available balance (held − outflows) drops by the invoice amount. Partial
   * coverage is rejected: the balance must cover the full invoice.
   */
  async applyToInvoice(
    invoiceId: string,
    managerId: string,
  ): Promise<ApplyDepositToInvoiceResult> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    return db.transaction(async (tx) => {
      // (1) The invoice must exist and be live (not voided).
      const [invoice] = await tx
        .select({
          residentId: invoices.residentId,
          period: invoices.period,
          amountPaise: invoices.amountPaise,
        })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), isNull(invoices.deletedAt)));
      if (!invoice) throw new NotFoundException("Invoice not found");

      // (2) The resident's deposit must be HELD. LOCK the row (FOR UPDATE): the
      // balance check below (read prior deductions → compare) and the deduction
      // insert are otherwise a non-atomic read-then-write. Two concurrent applies
      // for the SAME resident's two DIFFERENT unpaid invoices would each read the
      // pre-deduction balance and both pass, over-drawing the deposit (the
      // per-invoice flip at step 4 can't catch it — different invoice rows). The
      // row lock serialises every apply (and apply-vs-settleExit) on this
      // deposit, so the second waits and then sees the first's committed
      // deduction and fails the balance check with a clean 409.
      const [deposit] = await tx
        .select({ id: deposits.id, amountPaise: deposits.amountPaise })
        .from(deposits)
        .where(
          and(
            eq(deposits.residentId, invoice.residentId),
            eq(deposits.status, DepositStatus.HELD),
          ),
        )
        .for("update");
      if (!deposit)
        throw new ConflictException(
          "No held deposit on record for this resident",
        );

      // (3) Available balance must cover the full invoice (no partial settle).
      const prior = await sumOutflows(tx, deposit.id);
      const available = deposit.amountPaise - prior;
      if (available < invoice.amountPaise)
        throw new ConflictException(
          "Deposit balance is insufficient to cover this invoice",
        );

      // (4) Conditional flip PENDING/OVERDUE -> PAID (double-apply safe).
      const paid = await tx
        .update(invoices)
        .set({ status: InvoiceStatus.PAID })
        .where(
          and(
            eq(invoices.id, invoiceId),
            isNull(invoices.deletedAt),
            inArray(invoices.status, [
              InvoiceStatus.PENDING,
              InvoiceStatus.OVERDUE,
            ]),
          ),
        )
        .returning({ id: invoices.id });
      if (paid.length !== 1)
        throw new ConflictException(
          "Invoice is not payable (already settled or voided)",
        );

      // (5) Record the deduction tied to the invoice. Deposit stays HELD.
      await tx.insert(depositTransactions).values({
        tenantId,
        depositId: deposit.id,
        type: DepositTxnType.DEDUCTION,
        reason: `Rent for ${invoice.period}`,
        amountPaise: invoice.amountPaise,
        invoiceId,
        createdByUserId: managerId,
      });

      return {
        invoiceId,
        period: invoice.period,
        amountPaise: invoice.amountPaise,
        depositBalancePaise: available - invoice.amountPaise,
      };
    });
  }

  /**
   * Resident: raise a brand-new move-out request (preferred month + optional
   * note) — awaits manager approval before it becomes the approved exit. Guarded
   * by a CONDITIONAL update on the always-present resident row: only an ACTIVE
   * resident with no approved request and nothing already pending flips, so a
   * re-submit or an already-exited resident flips 0 rows and is rejected — no
   * select-then-update race. See `updateExitRequest`/`requestCancelExit` for
   * changing/cancelling an already-approved request.
   */
  async requestExit(
    residentId: string,
    input: ExitRequestInput,
  ): Promise<{ requestedDate: string }> {
    return this.raisePendingAction(
      residentId,
      ExitPendingType.REQUEST,
      input,
      /* requireApprovedExisting */ false,
    );
  }

  /**
   * Resident: propose changing the month of an already-approved move-out.
   * Awaits manager approval; the approved request is untouched until then.
   */
  async updateExitRequest(
    residentId: string,
    input: ExitRequestInput,
  ): Promise<{ requestedDate: string }> {
    return this.raisePendingAction(
      residentId,
      ExitPendingType.UPDATE,
      input,
      /* requireApprovedExisting */ true,
    );
  }

  /**
   * Resident: ask to cancel an already-approved move-out. Awaits manager
   * approval — the approved request stays in effect until then (see
   * `getForResident`'s deposit balance, which is unaffected either way: it's
   * computed live from the ledger, never from exit-request state).
   */
  async requestCancelExit(residentId: string): Promise<{ pending: true }> {
    await this.raisePendingAction(
      residentId,
      ExitPendingType.CANCEL,
      null,
      /* requireApprovedExisting */ true,
    );
    return { pending: true };
  }

  /**
   * Is an incoming resident's booking already depending on this resident's
   * CURRENT bed freeing up? Joins the resident's active allocation to a
   * PENDING booking on that same bed — the exact "is a booking waiting on
   * this bed" check `freeBed()` (`db/free-bed.ts`) already uses. Once true,
   * cancelling or changing the move-out date would strand that booking.
   */
  private async hasPendingBookingOnCurrentBed(
    db: Tx,
    residentId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: bookings.id })
      .from(allocations)
      .innerJoin(
        bookings,
        and(
          eq(bookings.bedId, allocations.bedId),
          eq(bookings.status, BookingStatus.PENDING),
        ),
      )
      .where(
        and(eq(allocations.residentId, residentId), isNull(allocations.endDate)),
      );
    return !!row;
  }

  /** Shared conditional-flip guard for requestExit/updateExitRequest/
   * requestCancelExit — they differ only in whether an approved request must
   * already exist and what date/note to stage as pending. UPDATE/CANCEL are
   * additionally blocked once an incoming resident's booking depends on the
   * current move-out date (see `hasPendingBookingOnCurrentBed`) — a plain
   * check-then-act is fine here since it's a business-rule gate, not a
   * concurrency guard; `approveExitRequest` re-checks it as the real backstop. */
  private async raisePendingAction(
    residentId: string,
    type: ExitPendingType,
    input: ExitRequestInput | null,
    requireApprovedExisting: boolean,
  ): Promise<{ requestedDate: string }> {
    const db = this.ctx.db();

    if (type === ExitPendingType.UPDATE || type === ExitPendingType.CANCEL) {
      if (await this.hasPendingBookingOnCurrentBed(db, residentId))
        throw new ConflictException(
          "An incoming resident's booking depends on your current move-out date — ask your manager to sort out the booking first",
        );
    }

    const updated = await db
      .update(users)
      .set({
        exitPendingType: type,
        exitPendingDate: input?.requestedDate ?? null,
        exitPendingNote: input?.note ?? null,
        exitPendingAt: new Date(),
      })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          eq(users.status, ResidentStatus.ACTIVE),
          requireApprovedExisting
            ? isNotNull(users.exitRequestedAt)
            : isNull(users.exitRequestedAt),
          isNull(users.exitPendingType),
        ),
      )
      .returning({ id: users.id });

    if (updated.length !== 1) {
      const [exists] = await db
        .select({
          status: users.status,
          requestedAt: users.exitRequestedAt,
          pendingType: users.exitPendingType,
        })
        .from(users)
        .where(
          and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
        );
      if (!exists) throw new NotFoundException("Resident not found");
      if (exists.pendingType)
        throw new ConflictException("A move-out action is already pending");
      if (requireApprovedExisting && !exists.requestedAt)
        throw new ConflictException("No approved move-out request on record");
      if (!requireApprovedExisting && exists.requestedAt)
        throw new ConflictException(
          "A move-out request is already approved — use update or cancel",
        );
      throw new ConflictException("Resident is not active");
    }
    return { requestedDate: input?.requestedDate ?? "" };
  }

  /**
   * Resident: withdraw their own pending action (request/update/cancel) before
   * a manager decides. No approval is needed to take back something that
   * hasn't taken effect yet — the complement to every pending action requiring
   * approval to go THROUGH.
   */
  async withdrawExitRequest(residentId: string): Promise<{ withdrawn: true }> {
    const db = this.ctx.db();
    const updated = await db
      .update(users)
      .set({
        exitPendingType: null,
        exitPendingDate: null,
        exitPendingNote: null,
        exitPendingAt: null,
      })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          isNotNull(users.exitPendingType),
        ),
      )
      .returning({ id: users.id });

    if (updated.length !== 1) {
      const [exists] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
        );
      if (!exists) throw new NotFoundException("Resident not found");
      throw new ConflictException("No pending move-out action to withdraw");
    }
    return { withdrawn: true };
  }

  /**
   * Manager: approve a resident's pending move-out action. Wrapped in a
   * transaction because approving a REQUEST/UPDATE also tries to settle the
   * resident's new last billed month from their deposit if that invoice
   * already exists (the generation-time fold in `RentService.generateMonthly`
   * only fires for an invoice created AFTER approval — this is the apply-now
   * counterpart for one created before).
   *
   * The state transition itself is a single CONDITIONAL UPDATE, guarded on
   * `exitPendingType IS NOT NULL` (the always-present marker for "something is
   * awaiting a decision") — the SET clause's CASE expressions read the
   * pre-update `exitPendingType`/`exitPendingDate`/`exitPendingNote` (Postgres
   * evaluates every SET expression against the row as it was before this
   * statement), so REQUEST/UPDATE adopt the pending date/note as the new
   * approved request and CANCEL nulls it out — all in one atomic statement, no
   * select-then-update race. A pre-check SELECT runs first only to read
   * `pendingType` for the booking guard (UPDATE/CANCEL only) — that guard can
   * tolerate a benign race (worst case: a booking sneaks in between this read
   * and the atomic update, and approval goes through when a re-decision would
   * have been ideal); the ACTUAL concurrency-correctness guarantee is still
   * the conditional UPDATE below.
   */
  async approveExitRequest(
    residentId: string,
    managerId: string,
  ): Promise<{ effective: ExitEffective | null }> {
    const db = this.ctx.db();
    const tenantId = this.ctx.currentTenantId()!;

    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ pendingType: users.exitPendingType })
        .from(users)
        .where(
          and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
        );
      if (!current) throw new NotFoundException("Resident not found");
      if (!current.pendingType)
        throw new ConflictException("No pending move-out action to approve");

      if (
        current.pendingType === ExitPendingType.UPDATE ||
        current.pendingType === ExitPendingType.CANCEL
      ) {
        if (await this.hasPendingBookingOnCurrentBed(tx, residentId))
          throw new ConflictException(
            "An incoming resident's booking depends on this move-out date — resolve the booking before approving",
          );
      }

      const [row] = await tx
        .update(users)
        .set({
          exitRequestedDate: sql`case when ${users.exitPendingType} = ${ExitPendingType.CANCEL} then null else ${users.exitPendingDate} end`,
          exitRequestNote: sql`case when ${users.exitPendingType} = ${ExitPendingType.CANCEL} then null else ${users.exitPendingNote} end`,
          exitRequestedAt: sql`case when ${users.exitPendingType} = ${ExitPendingType.CANCEL} then null else now() end`,
          exitPendingType: null,
          exitPendingDate: null,
          exitPendingNote: null,
          exitPendingAt: null,
        })
        .where(
          and(
            eq(users.id, residentId),
            eq(users.role, UserRole.RESIDENT),
            isNotNull(users.exitPendingType),
          ),
        )
        .returning({
          exitRequestedDate: users.exitRequestedDate,
          exitRequestNote: users.exitRequestNote,
          exitRequestedAt: users.exitRequestedAt,
        });

      if (!row)
        throw new ConflictException("No pending move-out action to approve");

      const effective: ExitEffective | null =
        row.exitRequestedAt && row.exitRequestedDate
          ? {
              date: row.exitRequestedDate,
              note: row.exitRequestNote,
              at: row.exitRequestedAt.toISOString(),
            }
          : null;

      // Apply-now: if this approval set/changed the effective move-out date,
      // and the new last billed month's invoice already exists (generated
      // before this approval), try to settle it from the deposit right away —
      // mirrors ChargesService.create's apply-now guard (skip if a payment is
      // already SUBMITTED, so approving never fights an in-flight payment).
      if (effective) {
        const lastPeriod = addMonthsToPeriod(effective.date.slice(0, 7), -1);
        const [invoice] = await tx
          .select({ id: invoices.id, amountPaise: invoices.amountPaise })
          .from(invoices)
          .where(
            and(
              eq(invoices.residentId, residentId),
              eq(invoices.period, lastPeriod),
              isNull(invoices.deletedAt),
              inArray(invoices.status, [
                InvoiceStatus.PENDING,
                InvoiceStatus.OVERDUE,
              ]),
            ),
          );
        if (invoice) {
          const [inFlightPayment] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(
              and(
                eq(payments.invoiceId, invoice.id),
                eq(payments.status, PaymentStatus.SUBMITTED),
              ),
            );
          if (!inFlightPayment) {
            await settleInvoiceFromDepositIfEligible(
              tx,
              tenantId,
              residentId,
              invoice.id,
              invoice.amountPaise,
              `Rent for ${lastPeriod} — auto-settled from deposit (final month)`,
              managerId,
            );
          }
        }
      }

      return { effective };
    });
  }

  /**
   * Manager: reject a resident's pending move-out action. The approved
   * request (if any) is left exactly as it was — only the pending action is
   * cleared.
   */
  async rejectExitRequest(
    residentId: string,
    _input: ExitDecisionInput,
  ): Promise<{ rejected: true }> {
    const db = this.ctx.db();
    const updated = await db
      .update(users)
      .set({
        exitPendingType: null,
        exitPendingDate: null,
        exitPendingNote: null,
        exitPendingAt: null,
      })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          isNotNull(users.exitPendingType),
        ),
      )
      .returning({ id: users.id });

    if (updated.length !== 1) {
      const [exists] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
        );
      if (!exists) throw new NotFoundException("Resident not found");
      throw new ConflictException("No pending move-out action to reject");
    }
    return { rejected: true };
  }

  /**
   * Settle a resident's exit: record deductions, refund the balance, mark the
   * resident EXITED, and free their bed — all in one transaction, guarded
   * against double-settle.
   */
  async settleExit(
    input: ExitSettlementInput,
    managerId: string,
  ): Promise<SettlementResult> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    return db.transaction(async (tx) => {
      // (1) Re-entry guard FIRST: conditional ACTIVE -> EXITED. A second
      // concurrent call flips 0 rows and bails before any side effect. Also
      // clears any exit-request state (approved + pending) so nothing stale
      // lingers on an EXITED resident.
      const exited = await tx
        .update(users)
        .set({
          status: ResidentStatus.EXITED,
          exitRequestedDate: null,
          exitRequestNote: null,
          exitRequestedAt: null,
          exitPendingType: null,
          exitPendingDate: null,
          exitPendingNote: null,
          exitPendingAt: null,
        })
        .where(
          and(
            eq(users.id, input.residentId),
            eq(users.role, UserRole.RESIDENT),
            eq(users.status, ResidentStatus.ACTIVE),
          ),
        )
        .returning({ id: users.id });

      if (exited.length !== 1) {
        const [exists] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.residentId),
              eq(users.role, UserRole.RESIDENT),
            ),
          );
        if (!exists) throw new NotFoundException("Resident not found");
        throw new ConflictException("Resident has already exited");
      }

      // (2) Settle the deposit if one is HELD. LOCK the row (FOR UPDATE) so this
      // serialises against a concurrent `applyToInvoice` on the same deposit:
      // without it, an apply could commit a fresh DEDUCTION between this read of
      // `priorOutflows` and the refund write, over-drawing the deposit. The
      // lock makes the apply wait (then see no HELD deposit) or makes us wait
      // (then read the apply's deduction into `priorOutflows`).
      const [deposit] = await tx
        .select()
        .from(deposits)
        .where(
          and(
            eq(deposits.residentId, input.residentId),
            eq(deposits.status, DepositStatus.HELD),
          ),
        )
        .for("update");

      let depositPaise = 0;
      let priorOutflows = 0;
      let available = 0;
      let totalDeductions = 0;
      let refund = 0;

      if (deposit) {
        depositPaise = deposit.amountPaise;
        // Deductions (and any mid-tenancy refunds, e.g. a room downgrade) may
        // already have reduced the balance pre-exit. The final refund is over
        // what's LEFT, and exit deductions are capped at the remaining
        // balance, not the original held sum — so
        // deposit = priorOutflows + newDeductions + refund holds.
        priorOutflows = await sumOutflows(tx, deposit.id);
        available = depositPaise - priorOutflows;
        totalDeductions = input.deductions.reduce(
          (sum, d) => sum + d.amountPaise,
          0,
        );
        if (totalDeductions > available) {
          // Throwing rolls back the EXITED flip so the manager can re-submit
          // valid line-items against the remaining balance.
          throw new ConflictException(
            "Deductions exceed the remaining deposit balance",
          );
        }
        refund = available - totalDeductions;

        if (input.deductions.length > 0) {
          await tx.insert(depositTransactions).values(
            input.deductions.map((d) => ({
              tenantId,
              depositId: deposit.id,
              type: DepositTxnType.DEDUCTION,
              reason: d.reason,
              amountPaise: d.amountPaise,
              createdByUserId: managerId,
            })),
          );
        }
        // Always record the refund line (even 0) so the ledger reconciles.
        await tx.insert(depositTransactions).values({
          tenantId,
          depositId: deposit.id,
          type: DepositTxnType.REFUND,
          reason: "Refund on exit",
          amountPaise: refund,
          createdByUserId: managerId,
        });
        await tx
          .update(deposits)
          .set({ status: DepositStatus.SETTLED })
          .where(eq(deposits.id, deposit.id));
      } else if (input.deductions.length > 0) {
        throw new ConflictException("No deposit on record to deduct from");
      }

      // (3) Free the bed if the resident still holds one.
      let bedFreed = false;
      const [active] = await tx
        .select()
        .from(allocations)
        .where(
          and(
            eq(allocations.residentId, input.residentId),
            isNull(allocations.endDate),
          ),
        );
      if (active) {
        await tx
          .update(allocations)
          .set({ endDate: new Date() })
          .where(eq(allocations.id, active.id));
        // Hand the bed to a waiting booking (→ RESERVED) or free it (→ VACANT).
        await freeBed(tx, active.bedId);
        bedFreed = true;
      }

      return {
        depositPaise,
        priorDeductionsPaise: priorOutflows,
        availablePaise: available,
        totalDeductionsPaise: totalDeductions,
        refundPaise: refund,
        exited: true,
        bedFreed,
      };
    });
  }

  /**
   * Manager: collect a deposit payment. Creates the deposit if none exists
   * yet (first payment), otherwise adds to the held amount — this is how a
   * partial deposit taken at booking (e.g. ₹2,000) gets topped up later at
   * move-in (e.g. ₹10,000 more). Locks the row (FOR UPDATE) so it can't race
   * a concurrent collect/refund/apply/settle on the same deposit.
   */
  async collect(
    input: CollectDepositInput,
    managerId: string,
  ): Promise<{ amountPaise: number }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    return db.transaction(async (tx) => {
      const [resident] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.residentId),
            eq(users.role, UserRole.RESIDENT),
          ),
        );
      if (!resident) throw new NotFoundException("Resident not found");

      const [deposit] = await tx
        .select({ id: deposits.id, status: deposits.status, amountPaise: deposits.amountPaise })
        .from(deposits)
        .where(eq(deposits.residentId, input.residentId))
        .for("update");

      let depositId: string;
      let newAmountPaise: number;

      if (!deposit) {
        const [row] = await tx
          .insert(deposits)
          .values({
            tenantId,
            residentId: input.residentId,
            amountPaise: input.amountPaise,
            status: DepositStatus.HELD,
          })
          .returning({ id: deposits.id });
        depositId = row.id;
        newAmountPaise = input.amountPaise;
      } else {
        if (deposit.status !== DepositStatus.HELD)
          throw new ConflictException(
            "Deposit is already settled and can't be collected against",
          );
        depositId = deposit.id;
        newAmountPaise = deposit.amountPaise + input.amountPaise;
        await tx
          .update(deposits)
          .set({ amountPaise: newAmountPaise })
          .where(eq(deposits.id, depositId));
      }

      await tx.insert(depositTransactions).values({
        tenantId,
        depositId,
        type: DepositTxnType.COLLECTION,
        amountPaise: input.amountPaise,
        createdByUserId: managerId,
      });

      return { amountPaise: newAmountPaise };
    });
  }

  /**
   * Manager: refund part of a resident's held deposit any time (not just at
   * exit) — e.g. a room downgrade lowers what's required. Capped at the live
   * available balance (held − outflows so far); locked FOR UPDATE against a
   * concurrent collect/refund/apply/settle on the same deposit.
   */
  async refund(
    input: RefundDepositInput,
    managerId: string,
  ): Promise<{ availablePaise: number }> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    return db.transaction(async (tx) => {
      const [deposit] = await tx
        .select({ id: deposits.id, status: deposits.status, amountPaise: deposits.amountPaise })
        .from(deposits)
        .where(eq(deposits.residentId, input.residentId))
        .for("update");
      if (!deposit)
        throw new NotFoundException("No deposit on record for this resident");
      if (deposit.status !== DepositStatus.HELD)
        throw new ConflictException(
          "Deposit is already settled and can't be refunded against",
        );

      const outflows = await sumOutflows(tx, deposit.id);
      const available = deposit.amountPaise - outflows;
      if (input.amountPaise > available)
        throw new ConflictException(
          "Refund exceeds the available deposit balance",
        );

      await tx.insert(depositTransactions).values({
        tenantId,
        depositId: deposit.id,
        type: DepositTxnType.REFUND,
        reason: input.reason,
        amountPaise: input.amountPaise,
        createdByUserId: managerId,
      });

      return { availablePaise: available - input.amountPaise };
    });
  }
}
