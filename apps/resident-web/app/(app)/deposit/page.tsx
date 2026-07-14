"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { MonthYearSheet } from "@/components/ui/month-year-sheet";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Screen } from "@/components/ui/screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { AppText } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk, useDeposit } from "@/lib/queries";
import { cn, formatDate, formatPaise, formatPeriod, toMessage, ymd } from "@/lib/utils";
import { DepositTxnType } from "@pg/shared";

/** First of next calendar month — the earliest month a resident can pick. */
function nextMonthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** `YYYY-MM-DD` (the 1st of the month) rendered as "August 2026". */
function monthLabel(date: string): string {
  return formatPeriod(date.slice(0, 7));
}

/** The calendar month before `date`'s month, rendered as "July 2026" — the
 * last billed month for a move-out date in `date`'s month (rent is billed
 * monthly, and the exit month itself is never invoiced). */
function monthBefore(date: string): string {
  const [y, m] = date.slice(0, 7).split("-").map(Number);
  const total = y * 12 + (m - 1) - 1;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return formatPeriod(`${year}-${String(month).padStart(2, "0")}`);
}

export default function DepositPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useDeposit();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"request" | "update">("request");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => nextMonthStart());
  const [note, setNote] = useState("");
  const [confirmAction, setConfirmAction] = useState<"cancel" | "withdraw" | null>(null);
  const [busy, setBusy] = useState(false);

  const exitRequest = data?.exitRequest ?? null;
  const effective = exitRequest?.effective ?? null;
  const pending = exitRequest?.pending ?? null;

  function openRequestSheet() {
    setSheetMode("request");
    setMonth(nextMonthStart());
    setNote("");
    setSheetOpen(true);
  }

  function openUpdateSheet() {
    setSheetMode("update");
    setMonth(effective ? new Date(`${effective.date}T00:00:00`) : nextMonthStart());
    setNote(effective?.note ?? "");
    setSheetOpen(true);
  }

  async function submitSheet() {
    setBusy(true);
    try {
      const input = { requestedDate: ymd(month), note: note.trim() || undefined };
      if (sheetMode === "update") {
        await api.resident.deposits.updateExitRequest(input);
        toast.success("Change requested — your manager will review it.");
      } else {
        await api.resident.deposits.requestExit(input);
        toast.success("Move-out request sent — your manager will review it.");
      }
      await queryClient.invalidateQueries({ queryKey: qk.deposit });
      setSheetOpen(false);
      setNote("");
    } catch (err) {
      toast.error(toMessage(err, "Could not send the request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction === "cancel") {
        await api.resident.deposits.cancelExitRequest();
        toast.success("Cancellation requested — your manager will review it.");
      } else {
        await api.resident.deposits.withdrawExitRequest();
        toast.success("Request withdrawn.");
      }
      await queryClient.invalidateQueries({ queryKey: qk.deposit });
      setConfirmAction(null);
    } catch (err) {
      toast.error(toMessage(err, "Could not complete this. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentClassName="gap-4">
      <Appbar title="Security deposit" />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load your deposit" onRetry={() => refetch()} />
      ) : !data?.deposit ? (
        <EmptyState
          icon="shield-outline"
          title="No deposit recorded"
          description="Once your manager records your security deposit, it will show here."
        />
      ) : (
        <>
          <Card className="items-center bg-brand">
            <AppText
              variant="caption"
              className="uppercase tracking-wider text-brand-foreground-dim"
            >
              Deposit held
            </AppText>
            <AppText
              variant="display"
              className="mt-1 text-[38px] leading-[44px] text-brand-foreground"
            >
              {formatPaise(data.availablePaise)}
            </AppText>
            <AppText variant="sub" className="text-brand-foreground-dim">
              Refunded on exit, less any deductions
            </AppText>
          </Card>

          {data.ledger.length ? (
            <Card>
              <AppText variant="caption" className="uppercase tracking-wider">
                Ledger
              </AppText>
              <div className="mt-3 flex flex-col">
                {data.ledger.map((t, i) => {
                  const collection = t.type === DepositTxnType.COLLECTION;
                  const refund = t.type === DepositTxnType.REFUND;
                  const last = i === data.ledger.length - 1;
                  const label = collection ? "Collected" : refund ? "Refund" : "Deduction";
                  return (
                    <div key={t.id} className="flex flex-row gap-3">
                      {/* Timeline rail: dot + connector */}
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            "mt-1 h-3 w-3 shrink-0 rounded-full border-2",
                            collection
                              ? "border-info-dot bg-info-bg"
                              : refund
                                ? "border-success-dot bg-success-bg"
                                : "border-danger-dot bg-danger-bg",
                          )}
                        />
                        {!last ? <span className="w-px flex-1 bg-line" /> : null}
                      </div>
                      <div
                        className={cn(
                          "flex flex-1 flex-row items-start justify-between",
                          !last && "pb-4",
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <AppText variant="body" weight="semibold" className="text-[14px]">
                            {label}
                          </AppText>
                          <AppText variant="sub" className="text-[12px]">
                            {t.reason ?? "—"} · {formatDate(t.createdAt)}
                          </AppText>
                        </div>
                        <AppText
                          variant="body"
                          weight="bold"
                          className={
                            collection ? "text-info" : refund ? "text-success" : "text-danger"
                          }
                        >
                          {refund || collection ? "" : "−"}
                          {formatPaise(t.amountPaise)}
                        </AppText>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {/* Confirmed (approved) move-out — shown whenever one is on record,
              even while a change/cancel is awaiting a decision below. */}
          {effective ? (
            <Card className="flex-row items-center gap-3 border-info-line bg-info-bg">
              <Icon name="calendar-outline" size={20} className="shrink-0 text-info" />
              <AppText variant="sub" weight="medium" className="flex-1 text-info">
                Move-out confirmed for {monthLabel(effective.date)} — billed through{" "}
                {monthBefore(effective.date)}, nothing after.
              </AppText>
            </Card>
          ) : null}

          {/* Whatever the resident is currently waiting on a decision for. */}
          {pending ? (
            <Card className="flex-row items-center gap-3 border-amber-line bg-amber-bg">
              <Icon name="time-outline" size={20} className="shrink-0 text-amber" />
              <AppText variant="sub" weight="medium" className="flex-1 text-amber">
                {pending.type === "CANCEL"
                  ? "Cancellation requested — awaiting manager approval."
                  : pending.type === "UPDATE"
                    ? `Change to ${monthLabel(pending.date!)} — awaiting manager approval.`
                    : `Move-out requested for ${monthLabel(pending.date!)} — awaiting manager approval.`}
              </AppText>
            </Card>
          ) : null}

          {/* Actions, one row per state. */}
          {!effective && !pending ? (
            <Button title="Request move-out" variant="ghost" onClick={openRequestSheet} />
          ) : pending && !effective ? (
            <Button
              title="Withdraw request"
              variant="ghost"
              onClick={() => setConfirmAction("withdraw")}
            />
          ) : effective && !pending ? (
            exitRequest?.bookingConflict ? (
              <Card className="flex-row items-center gap-3">
                <Icon
                  name="information-circle-outline"
                  size={20}
                  className="shrink-0 text-ink2"
                />
                <AppText variant="sub" className="flex-1 text-ink2">
                  Another resident's move-in depends on this date — ask your
                  manager to change or cancel it.
                </AppText>
              </Card>
            ) : (
              <div className="flex flex-row gap-3">
                <Button
                  title="Change month"
                  variant="ghost"
                  className="flex-1"
                  onClick={openUpdateSheet}
                />
                <Button
                  title="Cancel move-out"
                  variant="danger"
                  className="flex-1"
                  onClick={() => setConfirmAction("cancel")}
                />
              </div>
            )
          ) : null}
        </>
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetMode === "update" ? "Change move-out month" : "Request move-out"}
        subtitle="Pick the month you'll be gone by — you'll be billed through the month before, nothing after."
      >
        <div className="flex flex-col gap-2">
          <AppText variant="label" className="text-ink2">
            Move-out month
          </AppText>
          <PressableScale
            onClick={() => setMonthPickerOpen(true)}
            pressedScale={0.99}
            aria-label={`Move-out month, ${monthLabel(ymd(month))}`}
            className="flex w-full flex-row items-center justify-between rounded-field border-[1.5px] border-line bg-surface px-3.5 py-3"
          >
            <AppText variant="body" weight="semibold" className="text-[16px]">
              {monthLabel(ymd(month))}
            </AppText>
            <Icon name="calendar-outline" size={20} className="text-brand-deep" />
          </PressableScale>
        </div>
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything your manager should know…"
          multiline
        />
        <Button
          title={sheetMode === "update" ? "Send change request" : "Send request"}
          onClick={submitSheet}
          loading={busy}
        />
      </Sheet>

      {/* Mounted after the move-out sheet → renders on top of it. */}
      <MonthYearSheet
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        onSelect={setMonth}
        value={month}
        minDate={nextMonthStart()}
        title="Move-out month"
        subtitle="Earliest is next month."
        confirmLabel="Set month"
      />

      <Sheet
        visible={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === "cancel" ? "Cancel move-out?" : "Withdraw request?"}
        subtitle={
          confirmAction === "cancel"
            ? "Your manager will need to approve cancelling the confirmed move-out."
            : "This removes your pending request right away — no approval needed."
        }
      >
        <Button
          title={confirmAction === "cancel" ? "Request cancellation" : "Withdraw"}
          variant={confirmAction === "cancel" ? "danger" : "primary"}
          loading={busy}
          onClick={runConfirmAction}
        />
        <Button title="Never mind" variant="ghost" onClick={() => setConfirmAction(null)} />
      </Sheet>
    </Screen>
  );
}
