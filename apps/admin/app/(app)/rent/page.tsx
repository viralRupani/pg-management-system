"use client";

import type { InvoiceSummary, PaymentSummary } from "@pg/shared";
import { ImageIcon, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise, toMessage } from "@/lib/utils";

type Tab = "payments" | "invoices";
type StatusFilter = "SUBMITTED" | "APPROVED" | "REJECTED" | "ALL";

const PAYMENT_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "SUBMITTED", label: "Awaiting review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
];

function paymentTone(s: PaymentSummary["status"]) {
  return s === "APPROVED" ? "success" : s === "REJECTED" ? "danger" : "warning";
}

function invoiceTone(s: InvoiceSummary["status"]) {
  return s === "PAID"
    ? "success"
    : s === "OVERDUE"
      ? "danger"
      : s === "WAIVED"
        ? "neutral"
        : "warning";
}

const currentPeriod = () => new Date().toISOString().slice(0, 7);

const INVOICES_PAGE_SIZE = 10;

export default function RentPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("payments");
  const [payments, setPayments] = useState<PaymentSummary[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("SUBMITTED");
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  // Bumped to make the (self-fetching) Invoices tab reload after a generate or
  // an approval flips an invoice to PAID.
  const [invoicesRefresh, setInvoicesRefresh] = useState(0);

  // Action dialogs
  const [rejecting, setRejecting] = useState<PaymentSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [screenshot, setScreenshot] = useState<{
    payment: PaymentSummary;
    url: string | null;
    error: string | null;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadPayments = useCallback(async (filter: StatusFilter) => {
    const list = await api.payments.list(
      filter === "ALL" ? undefined : filter,
    );
    setPayments(list);
  }, []);

  // Payments react to the status filter.
  useEffect(() => {
    let cancelled = false;
    setPayments(null);
    setPaymentsFailed(false);
    (async () => {
      try {
        const list = await api.payments.list(
          statusFilter === "ALL" ? undefined : statusFilter,
        );
        if (!cancelled) setPayments(list);
      } catch (err) {
        if (!cancelled) {
          setPaymentsFailed(true);
          toast.error(toMessage(err, "Could not load payments."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, toast]);

  const approve = async (p: PaymentSummary) => {
    setBusyId(p.id);
    try {
      await api.payments.approve(p.id);
      // Approving flips the linked invoice to PAID; refresh payments and signal
      // the Invoices tab to reload (it refetches on next mount regardless).
      await loadPayments(statusFilter);
      setInvoicesRefresh((n) => n + 1);
    } catch (err) {
      toast.error(toMessage(err, "Could not approve the payment."));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (note: string) => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.payments.reject(rejecting.id, note);
      setRejecting(null);
      await loadPayments(statusFilter);
    } catch (err) {
      toast.error(toMessage(err, "Could not reject the payment."));
    } finally {
      setBusyId(null);
    }
  };

  const viewScreenshot = async (p: PaymentSummary) => {
    setScreenshot({ payment: p, url: null, error: null });
    try {
      const { downloadUrl } = await api.payments.screenshot(p.id);
      setScreenshot({ payment: p, url: downloadUrl, error: null });
    } catch (err) {
      const message = toMessage(err, "Could not load the screenshot.");
      setScreenshot({ payment: p, url: null, error: message });
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rent</h1>
          <p className="text-sm text-muted-foreground">
            Review payment submissions and manage monthly invoices.
          </p>
        </div>
        {tab === "invoices" && (
          <Button size="sm" onClick={() => setGenerating(true)}>
            <Plus className="h-4 w-4" />
            Generate invoices
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-md border border-border bg-card p-0.5">
        {(
          [
            ["payments", "Payments"],
            ["invoices", "Invoices"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded px-4 py-1.5 text-sm font-medium transition-colors",
              tab === value
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "payments" ? (
        <PaymentsTab
          payments={payments}
          loadFailed={paymentsFailed}
          statusFilter={statusFilter}
          onFilter={setStatusFilter}
          busyId={busyId}
          onApprove={approve}
          onReject={setRejecting}
          onView={viewScreenshot}
        />
      ) : (
        <InvoicesTab refreshKey={invoicesRefresh} />
      )}

      <RejectDialog
        payment={rejecting}
        busy={busyId === rejecting?.id}
        onClose={() => setRejecting(null)}
        onSubmit={reject}
      />
      <GenerateDialog
        open={generating}
        onClose={() => setGenerating(false)}
        onDone={() => {
          setGenerating(false);
          setInvoicesRefresh((n) => n + 1);
        }}
      />
      <ScreenshotDialog
        state={screenshot}
        onClose={() => setScreenshot(null)}
      />
    </div>
  );
}

function PaymentsTab({
  payments,
  loadFailed,
  statusFilter,
  onFilter,
  busyId,
  onApprove,
  onReject,
  onView,
}: {
  payments: PaymentSummary[] | null;
  loadFailed: boolean;
  statusFilter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  busyId: string | null;
  onApprove: (p: PaymentSummary) => void;
  onReject: (p: PaymentSummary) => void;
  onView: (p: PaymentSummary) => void;
}) {
  const hasRows = payments !== null && payments.length > 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilter(f.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              statusFilter === f.value
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {hasRows && (
          <div className="hidden items-center gap-4 border-b border-border px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
            <span className="flex-1">Resident</span>
            <span className="w-28 text-right">Amount</span>
            <span className="w-24 text-center">Status</span>
            <span className="w-[16rem] text-right">Actions</span>
          </div>
        )}
        <div className="px-5">
          {payments === null ? (
            loadFailed ? (
              <EmptyRow text="Couldn't load payments — try refreshing." />
            ) : (
              <ListSkeleton />
            )
          ) : payments.length === 0 ? (
            <EmptyRow text="No payments in this view." />
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => {
                const busy = busyId === p.id;
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
                  >
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {p.residentName}
                        </p>
                        <span className="shrink-0 rounded-full border border-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {p.method === "CASH" ? "Cash" : "UPI"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.period} · submitted {formatDate(p.createdAt)}
                      </p>
                      {p.method === "CASH" ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Paid in cash — confirm you received it before approving.
                        </p>
                      ) : p.referenceId ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          UPI ref{" "}
                          <span className="font-mono text-foreground">
                            {p.referenceId}
                          </span>
                        </p>
                      ) : null}
                      {p.reviewNote && (
                        <p className="mt-0.5 text-xs text-danger/90">
                          Note: {p.reviewNote}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-4">
                      <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatPaise(p.amountPaise)}
                      </span>
                      <div className="flex w-24 justify-center">
                        <Badge tone={paymentTone(p.status)}>
                          {p.status.toLowerCase()}
                        </Badge>
                      </div>
                      <div className="flex w-[16rem] items-center justify-end gap-2">
                        {p.hasScreenshot && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView(p)}
                          >
                            <ImageIcon className="h-4 w-4" />
                            View
                          </Button>
                        )}
                        {p.status === "SUBMITTED" && (
                          <>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => onApprove(p)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busy}
                              onClick={() => onReject(p)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function InvoicesTab({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InvoiceSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  // Debounce the search so we hit the API once the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new search invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Server-side search + pagination; also refetch when the parent signals a
  // change (generate / approval) via refreshKey.
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    (async () => {
      try {
        const res = await api.invoices.list({
          q: search || undefined,
          page,
          limit: INVOICES_PAGE_SIZE,
        });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(toMessage(err, "Could not load invoices."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, page, refreshKey, toast]);

  const totalPages = Math.max(1, Math.ceil(total / INVOICES_PAGE_SIZE));

  // Clamp the page if the total shrinks under it (e.g. after a refresh).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const rangeStart = total === 0 ? 0 : (page - 1) * INVOICES_PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * INVOICES_PAGE_SIZE, total);
  const searching = search !== "";
  // Show the search box once there's anything to search (or a search is active).
  const showSearch = items !== null && (total > 0 || searching);

  return (
    <div className="space-y-4">
      {showSearch && (
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by resident or period…"
          className="max-w-xs"
          aria-label="Search invoices"
        />
      )}

      <Card className="overflow-hidden">
        {items && items.length > 0 && (
          <div className="hidden items-center gap-4 border-b border-border px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
            <span className="flex-1">Resident</span>
            <span className="w-28 text-right">Amount</span>
            <span className="w-24 text-center">Status</span>
          </div>
        )}
        <div className="px-5">
          {items === null ? (
            loadFailed ? (
              <EmptyRow text="Couldn't load invoices — try refreshing." />
            ) : (
              <ListSkeleton />
            )
          ) : items.length === 0 ? (
            <EmptyRow
              text={
                searching
                  ? "No invoices match your search."
                  : "No invoices yet. Generate them for the current month."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
                >
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {inv.residentName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {inv.period} · due {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">
                      {formatPaise(inv.amountPaise)}
                    </span>
                    <div className="flex w-24 justify-center">
                      <Badge tone={invoiceTone(inv.status)}>
                        {inv.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {total > INVOICES_PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RejectDialog({
  payment,
  busy,
  onClose,
  onSubmit,
}: {
  payment: PaymentSummary | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  // Reset the note whenever a different payment is opened.
  useEffect(() => {
    setNote("");
  }, [payment?.id]);

  return (
    <Dialog
      open={payment !== null}
      onClose={onClose}
      title="Reject payment"
      description={
        payment
          ? `${payment.residentName} · ${payment.period} · ${formatPaise(payment.amountPaise)}`
          : undefined
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(note.trim());
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="reject-note">Reason</Label>
          <textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            maxLength={500}
            rows={3}
            placeholder="Tell the resident why this was rejected…"
            className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={busy || note.trim().length === 0}
          >
            Reject payment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type GenTarget = { id: string; name: string; bedLabel: string };

function GenerateDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Who to bill: "all" active residents (default), or an explicit subset —
  // useful for a single mid-month joiner once the monthly run already happened.
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [targets, setTargets] = useState<GenTarget[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Reset dialog fields whenever it opens.
  useEffect(() => {
    if (!open) return;
    setPeriod(currentPeriod());
    setDueDate("");
    setResult(null);
    setMode("all");
    setChecked(new Set());
    setTargets(null);
    setPickerQuery("");
    setPickerSearch("");
  }, [open]);

  // Debounce the picker search so we hit the API once the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setPickerSearch(pickerQuery.trim()), 500);
    return () => clearTimeout(t);
  }, [pickerQuery]);

  // Fetch the allocated-resident list from the backend — on open and on each
  // debounced search. The default list is capped at 100, but searching the
  // backend keeps every resident reachable past that cap (q = name/phone).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTargets(true);
    (async () => {
      try {
        const res = await api.residents.list({
          status: "ACTIVE",
          q: pickerSearch || undefined,
          limit: 100,
        });
        if (cancelled) return;
        // Only bed-allocated residents can be invoiced; an un-allocated pick
        // would silently generate nothing. bedLabel is null when unallocated.
        setTargets(
          res.items
            .filter((r) => r.bedLabel)
            .map((r) => ({ id: r.id, name: r.name, bedLabel: r.bedLabel! })),
        );
      } catch (err) {
        if (!cancelled) toast.error(toMessage(err, "Could not load residents."));
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, pickerSearch, toast]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api.invoices.generate({
        period: period || undefined,
        dueDate: dueDate || undefined,
        residentIds: mode === "selected" ? [...checked] : undefined,
      });
      setResult(
        `Generated ${res.generated} invoice${res.generated === 1 ? "" : "s"} for ${res.period}.`,
      );
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not generate invoices."));
    } finally {
      setBusy(false);
    }
  };

  const nothingSelected = mode === "selected" && checked.size === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate invoices"
      description="One invoice per resident from their room rent — a mid-month joiner is prorated for their first month. Safe to re-run; existing invoices are left untouched."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gen-period">Period (YYYY-MM)</Label>
            <Input
              id="gen-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder={currentPeriod()}
              pattern="\d{4}-(0[1-9]|1[0-2])"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-due">Due date (optional)</Label>
            <Input
              id="gen-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Residents</Label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="gen-mode"
                checked={mode === "all"}
                onChange={() => setMode("all")}
                className="accent-brand"
              />
              All active residents
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="gen-mode"
                checked={mode === "selected"}
                onChange={() => setMode("selected")}
                className="accent-brand"
              />
              Selected
              {checked.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({checked.size})
                </span>
              )}
            </label>
          </div>

          {mode === "selected" && (
            <div className="space-y-2">
              <Input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Search by name or phone…"
                aria-label="Search residents to bill"
              />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                {loadingTargets ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    {pickerSearch ? "Searching…" : "Loading…"}
                  </p>
                ) : !targets || targets.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    {pickerSearch
                      ? "No residents match your search."
                      : "No allocated residents to bill."}
                  </p>
                ) : (
                  targets.map((r) => (
                    <label
                      key={r.id}
                      className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="accent-brand"
                      />
                      <span className="flex-1">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Bed {r.bedLabel}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {result && <p className="text-sm text-success">{result}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" disabled={busy || nothingSelected}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ScreenshotDialog({
  state,
  onClose,
}: {
  state: { payment: PaymentSummary; url: string | null; error: string | null } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title="Payment screenshot"
      description={
        state
          ? `${state.payment.residentName} · ${state.payment.period} · ${formatPaise(state.payment.amountPaise)}`
          : undefined
      }
    >
      {state?.error ? (
        <p className="py-8 text-center text-sm text-danger">{state.error}</p>
      ) : state?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt="Payment screenshot"
          className="mx-auto max-h-[70vh] w-auto rounded-md border border-border"
        />
      ) : (
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      )}
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
  );
}
