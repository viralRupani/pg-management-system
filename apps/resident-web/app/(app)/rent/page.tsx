"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Row, Ricon, type RiconTone } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { Segmented } from "@/components/ui/segmented";
import { ListSkeleton } from "@/components/ui/skeleton";
import { invoiceBadge } from "@/components/ui/status";
import { AppText } from "@/components/ui/text";
import { useInvoices } from "@/lib/queries";
import { formatDate, formatPaise, formatPeriod } from "@/lib/utils";
import { InvoiceStatus, type InvoiceSummary } from "@pg/shared";

const RICON: Record<string, { name: string; tone: RiconTone }> = {
  [InvoiceStatus.PENDING]: { name: "time-outline", tone: "amber" },
  [InvoiceStatus.OVERDUE]: { name: "alert-circle-outline", tone: "danger" },
  [InvoiceStatus.PAID]: { name: "checkmark-done", tone: "success" },
  [InvoiceStatus.WAIVED]: { name: "checkmark-done", tone: "neutral" },
};

// A payment awaiting review outranks the invoice's own PENDING/OVERDUE icon.
const REVIEW_RICON: { name: string; tone: RiconTone } = {
  name: "hourglass-outline",
  tone: "info",
};

type Filter = "all" | "due" | "paid";

export default function RentPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useInvoices();
  const [filter, setFilter] = useState<Filter>("all");

  // Oldest unpaid first, so the card shows the current month before next month.
  // An invoice with a payment under review is pulled out — the card surfaces the
  // next rent the resident still needs to pay, not one already awaiting approval.
  const due = useMemo(
    () =>
      (data ?? [])
        .filter(
          (i) =>
            !i.deletedAt &&
            !i.underReview &&
            (i.status === InvoiceStatus.PENDING ||
              i.status === InvoiceStatus.OVERDUE),
        )
        .sort((a, b) => a.period.localeCompare(b.period))[0],
    [data],
  );

  const filtered = useMemo(() => {
    // Sort oldest → newest (period is zero-padded YYYY-MM, so lexicographic works).
    const list = [...(data ?? [])].sort((a, b) => a.period.localeCompare(b.period));
    if (filter === "due") {
      return list.filter(
        (i) =>
          !i.deletedAt &&
          (i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.OVERDUE),
      );
    }
    if (filter === "paid") {
      return list.filter((i) => !i.deletedAt && i.status === InvoiceStatus.PAID);
    }
    return list;
  }, [data, filter]);

  // Group by year so long histories stay scannable.
  const byYear = useMemo(() => {
    const groups = new Map<string, InvoiceSummary[]>();
    for (const inv of filtered) {
      const year = inv.period.slice(0, 4);
      const list = groups.get(year) ?? [];
      list.push(inv);
      groups.set(year, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  return (
    <Screen contentClassName="gap-4">
      <AppText variant="title" weight="heavy" className="text-[25px]">
        Rent
      </AppText>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load invoices" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon="wallet-outline"
          title="No invoices yet"
          description="Your rent invoices will appear here once your manager generates them."
        />
      ) : (
        <>
          {due ? (
            <Card className="bg-brand">
              <AppText
                variant="caption"
                className="uppercase tracking-wider text-brand-foreground-dim"
              >
                Current due
              </AppText>
              <AppText
                variant="display"
                className="mt-1 text-[40px] leading-[46px] text-brand-foreground"
              >
                {formatPaise(due.amountPaise)}
              </AppText>
              <AppText variant="sub" className="text-brand-foreground-dim">
                Due {formatDate(due.dueDate)}
              </AppText>
              <Button
                title="Pay now"
                variant="ghost"
                onClick={() => router.push(`/invoices?id=${due.id}`)}
                className="mt-3 self-start"
              />
            </Card>
          ) : null}

          <Segmented<Filter>
            options={[
              { label: "All", value: "all" },
              { label: "Due", value: "due" },
              { label: "Paid", value: "paid" },
            ]}
            value={filter}
            onChange={setFilter}
          />

          {!filtered.length ? (
            <EmptyState
              icon="funnel-outline"
              title="Nothing here"
              description="No invoices match this filter."
            />
          ) : (
            byYear.map(([year, invoices]) => (
              <Card key={year} padded={false} className="px-4">
                <AppText variant="caption" className="pt-4 uppercase tracking-wider">
                  {year}
                </AppText>
                {invoices.map((inv, i) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    first={i === 0}
                    onPress={() => router.push(`/invoices?id=${inv.id}`)}
                  />
                ))}
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function InvoiceRow({
  invoice,
  first,
  onPress,
}: {
  invoice: InvoiceSummary;
  first: boolean;
  onPress: () => void;
}) {
  const deleted = Boolean(invoice.deletedAt);
  const underReview = invoice.underReview && !deleted;
  const r = underReview
    ? REVIEW_RICON
    : (RICON[invoice.status] ?? RICON[InvoiceStatus.PENDING]);
  const status = invoiceBadge(invoice.status, underReview);
  return (
    <Row
      first={first}
      onPress={onPress}
      leading={<Ricon name={r.name} tone={r.tone} />}
      title={formatPeriod(invoice.period)}
      subtitle={deleted ? "Cancelled" : formatPaise(invoice.amountPaise)}
      trailing={
        deleted ? (
          <Badge label="Cancelled" variant="neutral" />
        ) : (
          <Badge label={status.label} variant={status.variant} />
        )
      }
    />
  );
}
