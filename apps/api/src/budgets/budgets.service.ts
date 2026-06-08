import { Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import {
  type BudgetSummaryRow,
  type ExpenseSummary,
  type RecordExpenseInput,
  type SetBudgetInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { budgets, expenses } from "../db/schema";

/**
 * Budgets & expenses are manager-only (no resident surface). A budget is a
 * monthly per-category limit (upsert keyed by tenant+category+period); expenses
 * are dated line items categorized by free text that lines up with a budget's
 * category. The summary joins them per period. Money is integer paise.
 */
@Injectable()
export class BudgetsService {
  constructor(private readonly ctx: TenantContextService) {}

  /** Manager: set/replace a category's budget for a period. */
  async setBudget(input: SetBudgetInput): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(budgets)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        category: input.category,
        period: input.period,
        limitPaise: input.limitPaise,
      })
      .onConflictDoUpdate({
        target: [budgets.tenantId, budgets.category, budgets.period],
        set: { limitPaise: input.limitPaise, updatedAt: new Date() },
      })
      .returning({ id: budgets.id });
    return { id: row.id };
  }

  /** Manager: record an expense. Recorder taken from the JWT sub. */
  async recordExpense(
    recorderId: string,
    input: RecordExpenseInput,
  ): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(expenses)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        category: input.category,
        amountPaise: input.amountPaise,
        note: input.note ?? null,
        spentOn: input.spentOn,
        recordedByUserId: recorderId, // from JWT sub
      })
      .returning({ id: expenses.id });
    return { id: row.id };
  }

  /** Manager: expenses for a period ('YYYY-MM'), newest spend first. */
  async listExpenses(period: string): Promise<ExpenseSummary[]> {
    const rows = await this.ctx
      .db()
      .select()
      .from(expenses)
      .where(sql`to_char(${expenses.spentOn}, 'YYYY-MM') = ${period}`)
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      amountPaise: r.amountPaise,
      note: r.note,
      spentOn: r.spentOn,
    }));
  }

  /**
   * Manager: spend-vs-budget for a period. One row per category that has either
   * a budget or any spend; limitPaise is null where no budget is set.
   */
  async summary(period: string): Promise<BudgetSummaryRow[]> {
    const db = this.ctx.db();

    const budgetRows = await db
      .select({ category: budgets.category, limitPaise: budgets.limitPaise })
      .from(budgets)
      .where(eq(budgets.period, period));

    const spendRows = await db
      .select({
        category: expenses.category,
        spentPaise: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)::int`,
      })
      .from(expenses)
      .where(sql`to_char(${expenses.spentOn}, 'YYYY-MM') = ${period}`)
      .groupBy(expenses.category);

    const byCategory = new Map<
      string,
      { limitPaise: number | null; spentPaise: number }
    >();
    for (const b of budgetRows) {
      byCategory.set(b.category, { limitPaise: b.limitPaise, spentPaise: 0 });
    }
    for (const s of spendRows) {
      const existing = byCategory.get(s.category);
      if (existing) existing.spentPaise = s.spentPaise;
      else byCategory.set(s.category, { limitPaise: null, spentPaise: s.spentPaise });
    }

    return [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        limitPaise: v.limitPaise,
        spentPaise: v.spentPaise,
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }
}
