import { and, eq, inArray } from "drizzle-orm";
import { DepositStatus, DepositTxnType, InvoiceStatus } from "@pg/shared";
import type { TenantContextService } from "../db/tenant-context";
import { deposits, depositTransactions, invoices } from "../db/schema";
import { sumOutflows } from "./deposit-ledger";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/**
 * Auto-settle an invoice from a resident's held deposit when it fully covers
 * the amount — used for a resident's LAST billed month once their move-out is
 * approved (see `RentService.generateMonthly` for the generation-time call and
 * `DepositsService.approveExitRequest` for the approval-time apply-now call).
 * Mirrors `DepositsService.applyToInvoice`'s discipline exactly: lock the
 * deposit row FOR UPDATE before reading the balance (serializes against a
 * concurrent apply/settle on the same deposit), and conditionally flip
 * PENDING/OVERDUE -> PAID so a lost race or an already-settled/voided invoice
 * is a no-op, not a double-charge. All-or-nothing — a partial balance does
 * NOT partially settle the invoice; the caller's normal billing flow takes
 * over untouched. Returns whether it settled.
 */
export async function settleInvoiceFromDepositIfEligible(
  tx: Tx,
  tenantId: string,
  residentId: string,
  invoiceId: string,
  amountPaise: number,
  reason: string,
  createdByUserId?: string,
): Promise<boolean> {
  if (amountPaise <= 0) return false;

  const [deposit] = await tx
    .select({ id: deposits.id, amountPaise: deposits.amountPaise })
    .from(deposits)
    .where(
      and(eq(deposits.residentId, residentId), eq(deposits.status, DepositStatus.HELD)),
    )
    .for("update");
  if (!deposit) return false;

  const available = deposit.amountPaise - (await sumOutflows(tx, deposit.id));
  if (available < amountPaise) return false;

  const paid = await tx
    .update(invoices)
    .set({ amountPaise, status: InvoiceStatus.PAID })
    .where(
      and(
        eq(invoices.id, invoiceId),
        inArray(invoices.status, [InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
      ),
    )
    .returning({ id: invoices.id });
  if (paid.length !== 1) return false; // lost a race / already settled or voided

  await tx.insert(depositTransactions).values({
    tenantId,
    depositId: deposit.id,
    type: DepositTxnType.DEDUCTION,
    reason,
    amountPaise,
    invoiceId,
    createdByUserId,
  });
  return true;
}
