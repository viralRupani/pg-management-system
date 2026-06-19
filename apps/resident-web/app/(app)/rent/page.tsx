"use client";

import { InvoiceStatus, type InvoiceSummary } from "@pg/shared";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Ricon, Row } from "@/components/ui/row";
import { Screen } from "@/components/ui/screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { invoiceStatus } from "@/components/ui/status";
import { useInvoices } from "@/lib/queries";
import { formatDate, formatPaise, formatPeriod } from "@/lib/utils";

const RICON: Record<string, { name: string; bg: string; color: string }> = {
  [InvoiceStatus.PENDING]: { name: "time-outline", bg: "bg-amber-bg", color: "#b45309" },
  [InvoiceStatus.OVERDUE]: { name: "alert-circle-outline", bg: "bg-danger-bg", color: "#b91c1c" },
  [InvoiceStatus.PAID]: { name: "checkmark-done", bg: "bg-success-bg", color: "#15803d" },
  [InvoiceStatus.WAIVED]: { name: "checkmark-done", bg: "bg-page", color: "#6b7280" },
};

export default function RentPage() {
  const router = useRouter();
  const { data, isLoading } = useInvoices();

  const due = data?.find(
    (i) =>
      !i.deletedAt &&
      (i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.OVERDUE),
  );

  return (
    <Screen contentClassName="flex flex-col gap-4">
      <h1 className="text-[25px] font-extrabold text-ink">Rent</h1>

      {isLoading ? (
        <ListSkeleton />
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
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-foreground/80">
                Current due
              </p>
              <p className="mt-1 text-[40px] font-extrabold text-brand-foreground">
                {formatPaise(due.amountPaise)}
              </p>
              <p className="text-[13px] text-brand-foreground/80">
                Due {formatDate(due.dueDate)}
              </p>
              <Button
                title="Pay now"
                variant="ghost"
                onClick={() => router.push(`/invoices?id=${due.id}`)}
                className="mt-3 self-start"
              />
            </Card>
          ) : null}

          <Card padded={false} className="px-4">
            <p className="pt-4 text-[13px] font-bold uppercase tracking-wider text-ink3">
              History
            </p>
            {data.map((inv, i) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                first={i === 0}
                onClick={() => router.push(`/invoices?id=${inv.id}`)}
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function InvoiceRow({
  invoice,
  first,
  onClick,
}: {
  invoice: InvoiceSummary;
  first: boolean;
  onClick: () => void;
}) {
  const deleted = Boolean(invoice.deletedAt);
  const r = RICON[invoice.status] ?? RICON[InvoiceStatus.PENDING];
  const status = invoiceStatus(invoice.status);
  return (
    <Row
      first={first}
      onClick={onClick}
      leading={<Ricon name={r.name} className={r.bg} color={r.color} />}
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
