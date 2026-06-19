"use client";

import { DepositTxnType } from "@pg/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { qk, useDeposit } from "@/lib/queries";
import { cn, formatDate, formatPaise, toMessage, ymd } from "@/lib/utils";

function plusDays(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export default function DepositPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useDeposit();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [date, setDate] = useState<Date>(() => plusDays(30));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const shift = (days: number) =>
    setDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + days);
      const min = plusDays(1);
      return next < min ? min : next;
    });

  async function submit() {
    setBusy(true);
    try {
      await api.resident.deposits.requestExit({
        requestedDate: ymd(date),
        note: note.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: qk.deposit });
      setSheetOpen(false);
      setNote("");
      toast.success("Your manager will review your move-out request.");
    } catch (err) {
      toast.error(toMessage(err, "Could not send. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-page">
      <Appbar title="Security deposit" />
      <Screen contentClassName="flex flex-col gap-4 pt-1">
        {isLoading ? (
          <ListSkeleton />
        ) : !data?.deposit ? (
          <EmptyState
            icon="shield-outline"
            title="No deposit recorded"
            description="Once your manager records your security deposit, it will show here."
          />
        ) : (
          <>
            <Card className="flex flex-col items-center bg-brand">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-foreground/80">
                Deposit held
              </span>
              <span className="mt-1 text-[38px] font-extrabold text-brand-foreground">
                {formatPaise(data.deposit.amountPaise)}
              </span>
              <span className="text-[13px] text-brand-foreground/80">
                Refunded on exit, less any deductions
              </span>
            </Card>

            {data.ledger.length ? (
              <Card>
                <p className="text-[13px] font-bold uppercase tracking-wider text-ink3">
                  Ledger
                </p>
                <div className="mt-2 flex flex-col">
                  {data.ledger.map((t, i) => {
                    const refund = t.type === DepositTxnType.REFUND;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "flex flex-row items-center justify-between py-2.5",
                          i > 0 && "border-t border-line2",
                        )}
                      >
                        <div className="flex-1">
                          <p className="text-[14px] font-semibold text-ink">
                            {refund ? "Refund" : "Deduction"}
                          </p>
                          <p className="text-[12px] text-ink2">
                            {t.reason ?? "—"} · {formatDate(t.createdAt)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-[15px] font-bold",
                            refund ? "text-success" : "text-danger",
                          )}
                        >
                          {refund ? "+" : "−"}
                          {formatPaise(t.amountPaise)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : null}

            {data.exitRequest ? (
              <Card className="flex flex-row items-center gap-3 bg-amber-bg">
                <Icon name="time-outline" size={20} color="#b45309" />
                <span className="flex-1 text-[13px] font-medium text-amber">
                  Move-out requested for{" "}
                  {formatDate(data.exitRequest.requestedDate)} — awaiting manager.
                </span>
              </Card>
            ) : (
              <Button
                title="Request move-out"
                variant="ghost"
                onClick={() => setSheetOpen(true)}
              />
            )}
          </>
        )}
      </Screen>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Request move-out"
        subtitle="Most PGs require 30 days' notice. Pick your preferred date."
      >
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink2">
            Move-out date
          </span>
          <div className="flex flex-row items-center justify-between rounded-btn border border-line px-3 py-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="p-2 active:opacity-60"
              aria-label="Earlier date"
            >
              <Icon name="remove-circle-outline" size={24} color="#6b7280" />
            </button>
            <span className="text-[16px] font-bold text-ink">
              {formatDate(ymd(date))}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="p-2 active:opacity-60"
              aria-label="Later date"
            >
              <Icon name="add-circle-outline" size={24} color="#6b7280" />
            </button>
          </div>
        </div>
        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything your manager should know…"
          multiline
        />
        <Button title="Send request" onClick={submit} loading={busy} />
      </Sheet>
    </div>
  );
}
