"use client";

import { ApiError } from "@pg/api-client";
import type { InvoiceSummary, PaymentSummary } from "@pg/shared";
import { AlertCircle, ImageIcon, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn, formatDate, formatPaise } from "@/lib/utils";

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

export default function RentPage() {
  const [tab, setTab] = useState<Tab>("payments");
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [payments, setPayments] = useState<PaymentSummary[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("SUBMITTED");
  const [error, setError] = useState<string | null>(null);

  // Action dialogs
  const [rejecting, setRejecting] = useState<PaymentSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [screenshot, setScreenshot] = useState<{
    payment: PaymentSummary;
    url: string | null;
    error: string | null;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toMessage = (err: unknown, fallback: string) =>
    err instanceof ApiError ? err.message : fallback;

  const loadPayments = useCallback(async (filter: StatusFilter) => {
    const list = await api.payments.list(
      filter === "ALL" ? undefined : filter,
    );
    setPayments(list);
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoices(await api.invoices.list());
  }, []);

  // Payments react to the status filter.
  useEffect(() => {
    let cancelled = false;
    setPayments(null);
    (async () => {
      try {
        const list = await api.payments.list(
          statusFilter === "ALL" ? undefined : statusFilter,
        );
        if (!cancelled) setPayments(list);
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load payments."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  // Invoices load once (and after a generate).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.invoices.list();
        if (!cancelled) setInvoices(list);
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load invoices."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const approve = async (p: PaymentSummary) => {
    setBusyId(p.id);
    setError(null);
    try {
      await api.payments.approve(p.id);
      // Approving flips the linked invoice to PAID, so refresh both.
      await Promise.all([loadPayments(statusFilter), loadInvoices()]);
    } catch (err) {
      setError(toMessage(err, "Could not approve the payment."));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (note: string) => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setError(null);
    try {
      await api.payments.reject(rejecting.id, note);
      setRejecting(null);
      await loadPayments(statusFilter);
    } catch (err) {
      setError(toMessage(err, "Could not reject the payment."));
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
      setScreenshot({
        payment: p,
        url: null,
        error: toMessage(err, "Could not load the screenshot."),
      });
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

      {error && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-5 text-danger">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

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
          statusFilter={statusFilter}
          onFilter={setStatusFilter}
          busyId={busyId}
          onApprove={approve}
          onReject={setRejecting}
          onView={viewScreenshot}
        />
      ) : (
        <InvoicesTab invoices={invoices} />
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
        onDone={async () => {
          setGenerating(false);
          await loadInvoices();
        }}
        onError={(m) => setError(m)}
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
  statusFilter,
  onFilter,
  busyId,
  onApprove,
  onReject,
  onView,
}: {
  payments: PaymentSummary[] | null;
  statusFilter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  busyId: string | null;
  onApprove: (p: PaymentSummary) => void;
  onReject: (p: PaymentSummary) => void;
  onView: (p: PaymentSummary) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === f.value
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          {payments === null ? (
            <ListSkeleton />
          ) : payments.length === 0 ? (
            <EmptyRow text="No payments in this view." />
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => {
                const busy = busyId === p.id;
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {p.residentName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.period} · submitted {formatDate(p.createdAt)}
                        {p.reviewNote ? ` · note: ${p.reviewNote}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatPaise(p.amountPaise)}
                      </span>
                      <Badge tone={paymentTone(p.status)}>
                        {p.status.toLowerCase()}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onView(p)}
                      >
                        <ImageIcon className="h-4 w-4" />
                        View
                      </Button>
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
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: InvoiceSummary[] | null }) {
  return (
    <Card>
      <CardContent className="pt-5">
        {invoices === null ? (
          <ListSkeleton />
        ) : invoices.length === 0 ? (
          <EmptyRow text="No invoices yet. Generate them for the current month." />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {inv.residentName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.period} · due {formatDate(inv.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatPaise(inv.amountPaise)}
                  </span>
                  <Badge tone={invoiceTone(inv.status)}>
                    {inv.status.toLowerCase()}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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

function GenerateDialog({
  open,
  onClose,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPeriod(currentPeriod());
      setDueDate("");
      setResult(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await api.invoices.generate({
        period: period || undefined,
        dueDate: dueDate || undefined,
      });
      setResult(
        `Generated ${res.generated} invoice${res.generated === 1 ? "" : "s"} for ${res.period}.`,
      );
      await onDone();
    } catch (err) {
      onError(
        err instanceof ApiError ? err.message : "Could not generate invoices.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate invoices"
      description="Creates one invoice per active resident from their room rent. Safe to re-run — existing invoices are left untouched."
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
        {result && <p className="text-sm text-success">{result}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" disabled={busy}>
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
