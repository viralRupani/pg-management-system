"use client";

import { ApiError } from "@pg/api-client";
import type { BudgetSummaryRow, ExpenseSummary } from "@pg/shared";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

/** Local "YYYY-MM" (zero-padded). NOT toISOString — that's UTC and shifts the
 * month in IST. The API validates period against ^\d{4}-(0[1-9]|1[0-2])$. */
function ymPeriod(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Local zero-padded YYYY-MM-DD (for the expense spentOn). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** A sensible default spentOn for the viewed month: today if the viewed month is
 * the current month, otherwise the 1st of that month. */
function defaultSpentOn(viewed: Date): string {
  const now = new Date();
  if (
    viewed.getFullYear() === now.getFullYear() &&
    viewed.getMonth() === now.getMonth()
  ) {
    return ymd(now);
  }
  return ymd(firstOfMonth(viewed));
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [summary, setSummary] = useState<BudgetSummaryRow[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const period = ymPeriod(month);

  const load = async () => {
    const [s, e] = await Promise.all([
      api.budgets.summary(period),
      api.budgets.expenses(period),
    ]);
    setSummary(s);
    setExpenses(e);
  };

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setExpenses(null);
    (async () => {
      try {
        const [s, e] = await Promise.all([
          api.budgets.summary(period),
          api.budgets.expenses(period),
        ]);
        if (!cancelled) {
          setSummary(s);
          setExpenses(e);
        }
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load budgets."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Known categories (this period) → datalist suggestions for both dialogs.
  const knownCategories = Array.from(
    new Set((summary ?? []).map((r) => r.category)),
  ).sort();

  const totalBudget = (summary ?? []).reduce(
    (sum, r) => sum + (r.limitPaise ?? 0),
    0,
  );
  const totalSpent = (summary ?? []).reduce((sum, r) => sum + r.spentPaise, 0);

  const monthLabel = month.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted-foreground">
            Track spend against category budgets, month by month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setBudgetOpen(true)}>
            <Wallet className="h-4 w-4" />
            Set budget
          </Button>
          <Button onClick={() => setExpenseOpen(true)}>
            <Plus className="h-4 w-4" />
            Record expense
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth(firstOfMonth(new Date()))}
        >
          This month
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-1 text-sm font-medium text-muted-foreground">
          {monthLabel}
        </span>
      </div>

      <ErrorBanner message={error} />

      {/* Spend-vs-budget summary */}
      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="pb-3">Category</th>
                <th className="pb-3 text-right">Budget</th>
                <th className="pb-3 text-right">Spent</th>
                <th className="pb-3 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {summary === null ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td colSpan={4} className="py-3">
                      <span className="block h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : summary.length === 0 ? (
                <tr className="border-t border-border">
                  <td
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No budgets or expenses for {monthLabel}.
                  </td>
                </tr>
              ) : (
                summary.map((row) => {
                  const remaining =
                    row.limitPaise == null
                      ? null
                      : row.limitPaise - row.spentPaise;
                  const over = remaining != null && remaining < 0;
                  const pct =
                    row.limitPaise && row.limitPaise > 0
                      ? Math.min(100, (row.spentPaise / row.limitPaise) * 100)
                      : null;
                  return (
                    <tr key={row.category} className="border-t border-border">
                      <td className="py-2.5">
                        <div className="font-medium">{row.category}</div>
                        {pct != null && (
                          <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                over ? "bg-danger" : "bg-brand",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {row.limitPaise == null
                          ? "—"
                          : formatPaise(row.limitPaise)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatPaise(row.spentPaise)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 text-right tabular-nums",
                          over && "font-medium text-danger",
                        )}
                      >
                        {remaining == null ? "—" : formatPaise(remaining)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {summary && summary.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-medium">
                  <td className="py-2.5">Total</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatPaise(totalBudget)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatPaise(totalSpent)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 text-right tabular-nums",
                      totalBudget > 0 &&
                        totalBudget - totalSpent < 0 &&
                        "text-danger",
                    )}
                  >
                    {totalBudget === 0
                      ? "—"
                      : formatPaise(totalBudget - totalSpent)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {/* Expense ledger */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Expenses
        </h2>
        {expenses === null ? (
          <Card>
            <CardContent className="space-y-3 pt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className="block h-5 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </CardContent>
          </Card>
        ) : expenses.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No expenses recorded for {monthLabel}.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border pt-2">
              {expenses.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{ex.category}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(ex.spentOn)}
                      </span>
                    </div>
                    {ex.note && (
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {ex.note}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatPaise(ex.amountPaise)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <datalist id="budget-categories">
        {knownCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <SetBudgetDialog
        open={budgetOpen}
        period={period}
        monthLabel={monthLabel}
        onClose={() => setBudgetOpen(false)}
        onDone={async () => {
          setBudgetOpen(false);
          await load();
        }}
        onError={setError}
      />
      <RecordExpenseDialog
        open={expenseOpen}
        defaultDate={defaultSpentOn(month)}
        minDate={ymd(firstOfMonth(month))}
        maxDate={ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0))}
        onClose={() => setExpenseOpen(false)}
        onDone={async () => {
          setExpenseOpen(false);
          await load();
        }}
        onError={setError}
      />
    </div>
  );
}

function SetBudgetDialog({
  open,
  period,
  monthLabel,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  period: string;
  monthLabel: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("");
      setAmount("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = category.trim();
    const rupees = Number(amount);
    if (!cat || !Number.isFinite(rupees) || rupees < 0) return;
    setBusy(true);
    try {
      await api.budgets.setBudget({
        category: cat,
        period,
        limitPaise: Math.round(rupees * 100),
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not save the budget."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set budget"
      description={`Monthly limit for ${monthLabel}. Saving replaces any existing budget for this category.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="b-category">Category</Label>
          <input
            id="b-category"
            list="budget-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            maxLength={60}
            placeholder="e.g. Utilities"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-amount">Monthly limit (₹)</Label>
          <Input
            id="b-amount"
            type="number"
            min={0}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="5000"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || category.trim() === "" || amount === ""}
          >
            {busy ? "Saving…" : "Save budget"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RecordExpenseDialog({
  open,
  defaultDate,
  minDate,
  maxDate,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  defaultDate: string;
  minDate: string;
  maxDate: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("");
      setAmount("");
      setSpentOn(defaultDate);
      setNote("");
    }
  }, [open, defaultDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = category.trim();
    const rupees = Number(amount);
    if (!cat || !Number.isFinite(rupees) || rupees <= 0 || !spentOn) return;
    setBusy(true);
    try {
      await api.budgets.recordExpense({
        category: cat,
        amountPaise: Math.round(rupees * 100),
        spentOn,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not record the expense."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record expense"
      description="Logs spend against a category. The date is limited to the month you're viewing, where this expense will appear."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="e-category">Category</Label>
          <input
            id="e-category"
            list="budget-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            maxLength={60}
            placeholder="e.g. Utilities"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="e-amount">Amount (₹)</Label>
            <Input
              id="e-amount"
              type="number"
              min={1}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="1200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-date">Date</Label>
            <Input
              id="e-date"
              type="date"
              value={spentOn}
              min={minDate}
              max={maxDate}
              onChange={(e) => setSpentOn(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-note">Note (optional)</Label>
          <textarea
            id="e-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="e.g. June electricity bill"
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || category.trim() === "" || amount === ""}
          >
            {busy ? "Saving…" : "Record expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-danger">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{message}</span>
      </CardContent>
    </Card>
  );
}
