"use client";

import type {
  InvoiceSchedule,
  InvoiceSummary,
  PaymentSummary,
} from "@pg/shared";
import { CalendarClock, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { FilterPills, Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise, toMessage } from "@/lib/utils";

type Tab = "payments" | "invoices" | "schedule";
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
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <RentPageInner />
    </Suspense>
  );
}

function RentPageInner() {
  const toast = useToast();
  // A "View invoices" link from a resident lands here pre-filtered to them.
  const residentId = useSearchParams().get("resident") ?? undefined;
  const [tab, setTab] = useState<Tab>(residentId ? "invoices" : "payments");

  // Following a fresh resident link keeps us on the Invoices tab.
  useEffect(() => {
    if (residentId) setTab("invoices");
  }, [residentId]);
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
    const list = await api.payments.list(filter === "ALL" ? undefined : filter);
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
      <PageHeader
        title="Rent"
        description="Review payment submissions and manage monthly invoices."
        actions={
          tab === "invoices" ? (
            <Button size="sm" onClick={() => setGenerating(true)}>
              <Plus className="h-4 w-4" />
              Generate invoices
            </Button>
          ) : undefined
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "payments", label: "Payments" },
          { value: "invoices", label: "Invoices" },
          { value: "schedule", label: "Schedule" },
        ]}
      />

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
      ) : tab === "invoices" ? (
        <InvoicesTab refreshKey={invoicesRefresh} residentId={residentId} />
      ) : (
        <ScheduleTab />
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
      <FilterPills
        value={statusFilter}
        onChange={onFilter}
        items={PAYMENT_FILTERS}
      />

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
                        <Link
                          href={`/residents?id=${p.residentId}`}
                          className="block truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
                        >
                          {p.residentName}
                        </Link>
                        <span className="shrink-0 rounded-full border border-input px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {p.method === "CASH" ? "Cash" : "UPI"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.period} · submitted {formatDate(p.createdAt)}
                      </p>
                      {p.method === "CASH" ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Paid in cash — confirm you received it before
                          approving.
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
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                      <span className="text-right text-sm font-semibold tabular-nums text-foreground sm:w-28">
                        {formatPaise(p.amountPaise)}
                      </span>
                      <div className="flex justify-center sm:w-24">
                        <Badge tone={paymentTone(p.status)}>
                          {p.status.toLowerCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end gap-2 sm:w-[16rem]">
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

function InvoicesTab({
  refreshKey,
  residentId,
}: {
  refreshKey: number;
  residentId?: string;
}) {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InvoiceSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<InvoiceSummary | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [residentName, setResidentName] = useState<string | null>(null);

  // Debounce the search so we hit the API once the user pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 500);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new search or resident filter invalidates the current page.
  useEffect(() => {
    setPage(1);
  }, [search, residentId]);

  // Server-side search + pagination, scoped to a resident when one is set; also
  // refetch when the parent signals a change (generate / approval) via refreshKey.
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    (async () => {
      try {
        const res = await api.invoices.list({
          residentId,
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
  }, [search, page, refreshKey, localRefresh, residentId, toast]);

  // Resolve the filtered resident's name for the banner — prefer a loaded
  // invoice row, fall back to a light fetch so it shows even with zero invoices.
  useEffect(() => {
    if (!residentId) {
      setResidentName(null);
      return;
    }
    if (items && items.length > 0) {
      setResidentName(items[0].residentName);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.residents.get(residentId);
        if (!cancelled) setResidentName(r.name);
      } catch {
        /* banner falls back to generic copy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [residentId, items]);

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
      {residentId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">
            Showing invoices for{" "}
            <span className="font-medium text-foreground">
              {residentName ?? "this resident"}
            </span>
          </span>
          <Link href="/rent" className="font-medium text-brand hover:underline">
            View all invoices
          </Link>
        </div>
      )}

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
              {items.map((inv) => {
                const deleted = Boolean(inv.deletedAt);
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
                  >
                    <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                      <Link
                        href={`/residents?id=${inv.residentId}`}
                        className={cn(
                          "block truncate text-sm font-medium hover:text-brand hover:underline",
                          deleted
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {inv.residentName}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {inv.period} · due {formatDate(inv.dueDate)}
                      </p>
                      {deleted && inv.deletedReason && (
                        <p className="mt-1 text-xs font-medium text-danger">
                          Deleted: {inv.deletedReason}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                      <span
                        className={cn(
                          "text-right text-sm font-semibold tabular-nums sm:w-28",
                          deleted
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {formatPaise(inv.amountPaise)}
                      </span>
                      <div className="flex justify-center sm:w-24">
                        <Badge
                          tone={deleted ? "neutral" : invoiceTone(inv.status)}
                        >
                          {deleted ? "deleted" : inv.status.toLowerCase()}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete invoice"
                        disabled={deleted}
                        onClick={() => setDeleting(inv)}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:invisible"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
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

      <DeleteInvoiceDialog
        invoice={deleting}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setDeleting(null);
          setLocalRefresh((n) => n + 1);
        }}
      />
    </div>
  );
}

function DeleteInvoiceDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceSummary | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason("");
  }, [invoice?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    setBusy(true);
    try {
      await api.invoices.delete(invoice.id, { reason: reason.trim() });
      onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not delete the invoice."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={invoice !== null}
      onClose={onClose}
      title="Delete invoice?"
      description={
        invoice
          ? `${invoice.residentName} · ${invoice.period} · ${formatPaise(invoice.amountPaise)}. This voids the invoice — it can no longer be paid, but stays listed with your reason.`
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="delete-reason">Reason</Label>
          <Textarea
            id="delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={300}
            rows={3}
            placeholder="Why is this invoice being deleted? (shown on the invoice)"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={busy}
            disabled={reason.trim().length === 0}
          >
            {busy ? "Deleting…" : "Delete invoice"}
          </Button>
        </div>
      </form>
    </Dialog>
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
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            maxLength={500}
            rows={3}
            placeholder="Tell the resident why this was rejected…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={busy}
            disabled={note.trim().length === 0}
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
        if (!cancelled)
          toast.error(toMessage(err, "Could not load residents."));
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
          <Button type="submit" loading={busy} disabled={nothingSelected}>
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
  state: {
    payment: PaymentSummary;
    url: string | null;
    error: string | null;
  } | null;
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
        <Skeleton className="h-64" />
      )}
    </Dialog>
  );
}

// --- Automatic invoice-generation schedule ---------------------------------

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const fmtTime = (h: number, m: number): string =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Local YYYY-MM (the schedule's IST day == the manager's local day in India). */
const localPeriod = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * The next IST instant the schedule will fire. If this month's slot is still in
 * the future AND it hasn't already generated this period, that's the next run;
 * otherwise it rolls to next month. Display-only (built with local getters).
 */
function nextRun(s: InvoiceSchedule): Date {
  const now = new Date();
  let cand = new Date(
    now.getFullYear(),
    now.getMonth(),
    s.dayOfMonth,
    s.hour,
    s.minute,
  );
  const ranThisPeriod = s.lastRunPeriod === localPeriod(now);
  if (ranThisPeriod || cand <= now) {
    cand = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      s.dayOfMonth,
      s.hour,
      s.minute,
    );
  }
  return cand;
}

const fmtDateTime = (d: Date): string =>
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + `, ${fmtTime(d.getHours(), d.getMinutes())}`;

function ScheduleTab() {
  const toast = useToast();
  const [schedule, setSchedule] = useState<InvoiceSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSchedule(await api.invoices.getSchedule());
    } catch (err) {
      toast.error(toMessage(err, "Could not load the schedule."));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Skeleton className="h-40" />;
  }

  return (
    <>
      <Card className="p-5">
        {schedule ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-brand" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Invoices generate automatically on the{" "}
                  <span className="text-brand">
                    {ordinal(schedule.dayOfMonth)}
                  </span>{" "}
                  of every month at{" "}
                  <span className="text-brand">
                    {fmtTime(schedule.hour, schedule.minute)}
                  </span>{" "}
                  IST.
                </p>
                <p className="text-sm text-muted-foreground">
                  Next run: {fmtDateTime(nextRun(schedule))} ·{" "}
                  {schedule.lastRunPeriod
                    ? `last generated for ${schedule.lastRunPeriod}`
                    : "not yet run"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleting(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No schedule set</p>
                <p className="text-sm text-muted-foreground">
                  Invoices are generated only when you click “Generate invoices”.
                  Set up a schedule to have them created automatically each month.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Plus className="h-4 w-4" />
              Set up schedule
            </Button>
          </div>
        )}
      </Card>

      <ScheduleDialog
        open={editing}
        current={schedule}
        onClose={() => setEditing(false)}
        onDone={async () => {
          setEditing(false);
          await load();
        }}
      />
      <DeleteScheduleDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onDone={async () => {
          setDeleting(false);
          await load();
        }}
      />
    </>
  );
}

function ScheduleDialog({
  open,
  current,
  onClose,
  onDone,
}: {
  open: boolean;
  current: InvoiceSchedule | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [time, setTime] = useState("02:00");
  const [busy, setBusy] = useState(false);

  // Seed from the existing schedule (edit) or defaults (create) on open.
  useEffect(() => {
    if (!open) return;
    setDayOfMonth(current?.dayOfMonth ?? 1);
    setTime(
      current ? fmtTime(current.hour, current.minute) : "02:00",
    );
  }, [open, current]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) {
      toast.error("Pick a valid time.");
      return;
    }
    setBusy(true);
    try {
      await api.invoices.setSchedule({ dayOfMonth, hour: h, minute: m });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not save the schedule."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={current ? "Edit schedule" : "Set up schedule"}
      description="Invoices for the current month are generated automatically at this day and time (IST) every month. Re-runs are safe — already-billed residents are skipped."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sched-day">Day of month</Label>
            <Select
              id="sched-day"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Capped at the 28th so every month has the date.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-time">Time (IST)</Label>
            <Input
              id="sched-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? "Saving…" : current ? "Save changes" : "Create schedule"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteScheduleDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.invoices.deleteSchedule();
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not delete the schedule."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete schedule?"
      description="Invoices will no longer be generated automatically. You can still generate them manually any time from the Invoices tab."
    >
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="danger" loading={busy} onClick={submit}>
          {busy ? "Deleting…" : "Delete schedule"}
        </Button>
      </div>
    </Dialog>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <EmptyState compact title={text} className="py-8" />;
}
