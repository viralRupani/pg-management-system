import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  BedStatus,
  type DepositSummary,
  DepositStatus,
  type DepositTransactionSummary,
  DepositTxnType,
  type ExitSettlementInput,
  type RecordDepositInput,
  ResidentStatus,
  type SettlementResult,
  UserRole,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import {
  allocations,
  beds,
  depositTransactions,
  deposits,
  users,
} from "../db/schema";

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Security deposits + exit settlement. The settlement is the load-bearing flow:
 * it has irreversible side effects (free bed, mark EXITED, write a REFUND), so
 * it is guarded by a CONDITIONAL status flip on the always-present entity (the
 * resident: ACTIVE -> EXITED) BEFORE any side effect. A concurrent second call
 * flips 0 rows and bails with 409, so nothing double-settles. The ledger
 * invariant `held = Σdeductions + refund` is enforced by rejecting
 * over-deductions.
 */
@Injectable()
export class DepositsService {
  constructor(private readonly ctx: TenantContextService) {}

  /** Manager: record a resident's deposit (one per resident). */
  async record(input: RecordDepositInput): Promise<{ id: string }> {
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
      const [row] = await db
        .insert(deposits)
        .values({
          tenantId: this.ctx.currentTenantId()!,
          residentId: input.residentId,
          amountPaise: input.amountPaise,
          status: DepositStatus.HELD,
        })
        .returning({ id: deposits.id });
      return { id: row.id };
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION)
        throw new ConflictException("Deposit already recorded for this resident");
      throw err;
    }
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
    ledger: DepositTransactionSummary[];
  }> {
    const db = this.ctx.db();
    const [row] = await db
      .select({
        id: deposits.id,
        residentId: deposits.residentId,
        residentName: users.name,
        amountPaise: deposits.amountPaise,
        status: deposits.status,
      })
      .from(deposits)
      .innerJoin(users, eq(users.id, deposits.residentId))
      .where(eq(deposits.residentId, residentId));

    if (!row) return { deposit: null, ledger: [] };

    const txns = await db
      .select()
      .from(depositTransactions)
      .where(eq(depositTransactions.depositId, row.id));

    return {
      deposit: {
        id: row.id,
        residentId: row.residentId,
        residentName: row.residentName,
        amountPaise: row.amountPaise,
        status: row.status as DepositStatus,
      },
      ledger: txns.map((t) => ({
        id: t.id,
        type: t.type as DepositTxnType,
        reason: t.reason,
        amountPaise: t.amountPaise,
        createdAt: t.createdAt.toISOString(),
      })),
    };
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

      // (2) Settle the deposit if one is HELD.
      const [deposit] = await tx
        .select()
        .from(deposits)
        .where(
          and(
            eq(deposits.residentId, input.residentId),
            eq(deposits.status, DepositStatus.HELD),
          ),
        );

      let depositPaise = 0;
      let totalDeductions = 0;
      let refund = 0;

      if (deposit) {
        depositPaise = deposit.amountPaise;
        totalDeductions = input.deductions.reduce(
          (sum, d) => sum + d.amountPaise,
          0,
        );
        if (totalDeductions > depositPaise) {
          // Keeps held = Σdeductions + refund; throwing rolls back the EXITED
          // flip so the manager can re-submit valid line-items.
          throw new ConflictException(
            "Deductions exceed the deposit amount",
          );
        }
        refund = depositPaise - totalDeductions;

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
        await tx
          .update(beds)
          .set({ status: BedStatus.VACANT })
          .where(eq(beds.id, active.bedId));
        bedFreed = true;
      }

      return {
        depositPaise,
        totalDeductionsPaise: totalDeductions,
        refundPaise: refund,
        exited: true,
        bedFreed,
      };
    });
  }
}
