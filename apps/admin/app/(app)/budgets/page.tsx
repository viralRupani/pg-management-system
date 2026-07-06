"use client";

import type { BudgetSummaryRow, ExpenseSummary } from "@pg/shared";
import { ChevronLeft, ChevronRight, Plus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, Th, THead, Td, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise, toMessage } from "@/lib/utils";

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
  const toast = useToast();
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [summary, setSummary] = useState<BudgetSummaryRow[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [tab, setTab] = useState<"budget" | "expenses">("budget");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

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
    setLoadFailed(false);
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
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(toMessage(err, "Could not load budgets."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, toast]);

  // Switching month resets the expense filter + pagination.
  useEffect(() => {
    setCategoryFilter("all");
    setPage(1);
  }, [period]);

  // Changing the filter sends us back to the first page.
  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  // Known categories (this period) → datalist suggestions for both dialogs.
  const knownCategories = Array.from(
    new Set((summary ?? []).map((r) => r.category)),
  ).sort();

  // Categories actually present in this month's expenses → filter dropdown
  // options (every choice yields rows; budgeted-but-unspent categories excluded).
  const expenseCategories = Array.from(
    new Set((expenses ?? []).map((e) => e.category)),
  ).sort();

  // Client-side filter + pagination over the already-loaded (newest-first) ledger.
  const PAGE_SIZE = 10;
  const filteredExpenses = (expenses ?? []).filter(
    (e) => categoryFilter === "all" || e.category === categoryFilter,
  );
  const pageCount = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pagedExpenses = filteredExpenses.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );

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
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Track spend against category budgets, month by month."
        actions={
          <>
            <Button variant="outline" onClick={() => setBudgetOpen(true)}>
              <Wallet className="h-4 w-4" />
              Set budget
            </Button>
            <Button onClick={() => setExpenseOpen(true)}>
              <Plus className="h-4 w-4" />
              Record expense
            </Button>
          </>
        }
      />

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

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "budget", label: "Budget" },
          { value: "expenses", label: "Expenses" },
        ]}
      />

      {tab === "budget" ? (
        /* Spend-vs-budget summary */
        <Card>
          <CardContent className="pt-5">
            <Table className="min-w-[560px]">
              <THead>
                <tr>
                  <Th className="pb-3 pt-0">Category</Th>
                  <Th className="pb-3 pt-0 text-right">Budget</Th>
                  <Th className="pb-3 pt-0 text-right">Spent</Th>
                  <Th className="pb-3 pt-0 text-right">Remaining</Th>
                </tr>
              </THead>
              <TBody className="border-t border-border">
                {summary === null ? (
                  loadFailed ? (
                    <tr>
                      <Td
                        colSpan={4}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Couldn&apos;t load budgets — try refreshing.
                      </Td>
                    </tr>
                  ) : (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <Td colSpan={4} className="py-3">
                          <Skeleton className="h-4 w-full" />
                        </Td>
                      </tr>
                    ))
                  )
                ) : summary.length === 0 ? (
                  <tr>
                    <Td
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No budgets or expenses for {monthLabel}.
                    </Td>
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
                      <Tr key={row.category}>
                        <Td className="py-2.5">
                          <div className="font-medium">{row.category}</div>
                          {pct != null && (
                            <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-[width] duration-300",
                                  over ? "bg-danger" : "bg-brand",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </Td>
                        <Td className="py-2.5 text-right tabular-nums">
                          {row.limitPaise == null
                            ? "—"
                            : formatPaise(row.limitPaise)}
                        </Td>
                        <Td className="py-2.5 text-right tabular-nums">
                          {formatPaise(row.spentPaise)}
                        </Td>
                        <Td
                          className={cn(
                            "py-2.5 text-right tabular-nums",
                            over && "font-medium text-danger",
                          )}
                        >
                          {remaining == null ? "—" : formatPaise(remaining)}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </TBody>
              {summary && summary.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-medium">
                    <Td className="py-2.5">Total</Td>
                    <Td className="py-2.5 text-right tabular-nums">
                      {formatPaise(totalBudget)}
                    </Td>
                    <Td className="py-2.5 text-right tabular-nums">
                      {formatPaise(totalSpent)}
                    </Td>
                    <Td
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
                    </Td>
                  </tr>
                </tfoot>
              )}
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Category filter */}
          {expenses && expenses.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="exp-filter" className="text-muted-foreground">
                Category
              </Label>
              <Select
                id="exp-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 w-auto min-w-44"
              >
                <option value="all">All categories</option>
                {expenseCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {expenses === null ? (
            loadFailed ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Couldn&apos;t load expenses — try refreshing.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="space-y-3 pt-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </CardContent>
              </Card>
            )
          ) : filteredExpenses.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {expenses.length === 0
                  ? `No expenses recorded for ${monthLabel}.`
                  : "No expenses match this category."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-5">
                <Table className="min-w-[560px]">
                  <THead>
                    <tr>
                      <Th className="pb-3 pt-0">Date</Th>
                      <Th className="pb-3 pt-0">Category</Th>
                      <Th className="pb-3 pt-0">Note</Th>
                      <Th className="pb-3 pt-0 text-right">Amount</Th>
                    </tr>
                  </THead>
                  <TBody className="border-t border-border">
                    {pagedExpenses.map((ex) => (
                      <Tr key={ex.id}>
                        <Td className="whitespace-nowrap py-2.5 text-muted-foreground">
                          {formatDate(ex.spentOn)}
                        </Td>
                        <Td className="py-2.5">
                          <Badge tone="neutral">{ex.category}</Badge>
                        </Td>
                        <Td className="py-2.5 text-muted-foreground">
                          <span className="block max-w-xs truncate">
                            {ex.note || "—"}
                          </span>
                        </Td>
                        <Td className="py-2.5 text-right font-medium tabular-nums">
                          {formatPaise(ex.amountPaise)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          {filteredExpenses.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Showing {(pageSafe - 1) * PAGE_SIZE + 1}–
                {Math.min(pageSafe * PAGE_SIZE, filteredExpenses.length)} of{" "}
                {filteredExpenses.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {pageSafe} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageSafe >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
}: {
  open: boolean;
  period: string;
  monthLabel: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not save the budget."));
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
          <Input
            id="b-category"
            list="budget-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            maxLength={60}
            placeholder="e.g. Utilities"
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
            loading={busy}
            disabled={category.trim() === "" || amount === ""}
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
}: {
  open: boolean;
  defaultDate: string;
  minDate: string;
  maxDate: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
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
      toast.error(toMessage(err, "Could not record the expense."));
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
          <Input
            id="e-category"
            list="budget-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            maxLength={60}
            placeholder="e.g. Utilities"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Textarea
            id="e-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="e.g. June electricity bill"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={category.trim() === "" || amount === ""}
          >
            {busy ? "Saving…" : "Record expense"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
