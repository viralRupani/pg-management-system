import { and, eq, inArray, sql } from "drizzle-orm";
import { DepositTxnType } from "@pg/shared";
import type { TenantContextService } from "../db/tenant-context";
import { depositTransactions } from "../db/schema";

/** Drizzle transaction handle (the arg to `db.transaction(async (tx) => …)`). */
type Tx = Parameters<
  Parameters<ReturnType<TenantContextService["db"]>["transaction"]>[0]
>[0];

/** Σ of DEDUCTION + REFUND line-items on a deposit (the part of the held sum
 * spent or already given back — refunds aren't exit-only, so this must
 * cover both to keep `available` accurate). Shared by `DepositsService` and
 * `settleInvoiceFromDepositIfEligible` (rent generation runs outside
 * `DepositsService`, so this can't be a private method there). */
export async function sumOutflows(tx: Tx, depositId: string): Promise<number> {
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
