import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type ApplyDepositToInvoiceResult,
  type CollectDepositInput,
  type DepositSummary,
  DepositStatus,
  type DepositTransactionSummary,
  DepositTxnType,
  type ExitRequestInput,
  type ExitRequestSummary,
  type ExitSettlementInput,
  InvoiceStatus,
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
  depositTransactions,
  deposits,
  invoices,
  users,
} from "../db/schema";
import { freeBed } from "../db/free-bed";
import { isUniqueViolation } from "../db/pg-errors";

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
      const prior = await this.sumOutflows(tx, deposit.id);
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
      })
      .from(users)
      .where(
        and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
      );

    const exitRequest: ExitRequestSummary | null =
      resident?.exitRequestedAt && resident.exitRequestedDate
        ? {
            requestedDate: resident.exitRequestedDate,
            note: resident.exitRequestNote,
            requestedAt: resident.exitRequestedAt.toISOString(),
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

    const availablePaise = row.amountPaise - (await this.sumOutflows(db, row.id));

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

  /** Σ of DEDUCTION + REFUND line-items on a deposit (the part of the held sum
   * spent or already given back — refunds aren't exit-only, so this must
   * cover both to keep `available` accurate). */
  private async sumOutflows(tx: Tx, depositId: string): Promise<number> {
    const [r] = await tx
      .select({
        total: sql<number>`coalesce(sum(${depositTransactions.amountPaise}), 0)::int`,
      })
      .from(depositTransactions)
      .where(
        and(
          eq(depositTransactions.depositId, depositId),
          inArray(depositTransactions.type, [
            DepositTxnType.DEDUCTION,
            DepositTxnType.REFUND,
          ]),
        ),
      );
    return r?.total ?? 0;
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
      const prior = await this.sumOutflows(tx, deposit.id);
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
   * Resident: raise a move-out request (preferred date + optional note). Guarded
   * by a CONDITIONAL update on the always-present resident row: only an ACTIVE
   * resident with no request pending flips, so a re-submit or an already-exited
   * resident flips 0 rows and is rejected — no select-then-update race.
   */
  async requestExit(
    residentId: string,
    input: ExitRequestInput,
  ): Promise<{ requestedDate: string }> {
    const db = this.ctx.db();
    const updated = await db
      .update(users)
      .set({
        exitRequestedDate: input.requestedDate,
        exitRequestNote: input.note ?? null,
        exitRequestedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, residentId),
          eq(users.role, UserRole.RESIDENT),
          eq(users.status, ResidentStatus.ACTIVE),
          isNull(users.exitRequestedAt),
        ),
      )
      .returning({ id: users.id });

    if (updated.length !== 1) {
      const [exists] = await db
        .select({ status: users.status, requestedAt: users.exitRequestedAt })
        .from(users)
        .where(
          and(eq(users.id, residentId), eq(users.role, UserRole.RESIDENT)),
        );
      if (!exists) throw new NotFoundException("Resident not found");
      if (exists.requestedAt)
        throw new ConflictException("A move-out request is already pending");
      throw new ConflictException("Resident is not active");
    }
    return { requestedDate: input.requestedDate };
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
      // concurrent call flips 0 rows and bails before any side effect.
      const exited = await tx
        .update(users)
        .set({ status: ResidentStatus.EXITED })
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
        priorOutflows = await this.sumOutflows(tx, deposit.id);
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

      const outflows = await this.sumOutflows(tx, deposit.id);
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
