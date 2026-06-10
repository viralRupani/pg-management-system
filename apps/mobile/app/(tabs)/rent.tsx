import { useRouter } from 'expo-router';
import { RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Row, Ricon } from '@/components/ui/row';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { invoiceStatus } from '@/components/ui/status';
import { useInvoices } from '@/lib/queries';
import { InvoiceStatus, type InvoiceSummary } from '@pg/shared';
import { formatDate, formatPaise } from '@/lib/utils';

const RICON: Record<string, { name: 'time-outline' | 'checkmark-done' | 'alert-circle-outline'; bg: string; color: string }> = {
  [InvoiceStatus.PENDING]: { name: 'time-outline', bg: 'bg-amber-bg', color: '#b45309' },
  [InvoiceStatus.OVERDUE]: { name: 'alert-circle-outline', bg: 'bg-danger-bg', color: '#b91c1c' },
  [InvoiceStatus.PAID]: { name: 'checkmark-done', bg: 'bg-success-bg', color: '#15803d' },
  [InvoiceStatus.WAIVED]: { name: 'checkmark-done', bg: 'bg-page', color: '#6b7280' },
};

export default function RentScreen() {
  const router = useRouter();
  const { data, isLoading, isFetching, refetch } = useInvoices();

  const due = data?.find(
    (i) => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.OVERDUE,
  );

  return (
    <Screen
      contentClassName="gap-4"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Text className="text-[25px] font-extrabold text-ink">Rent</Text>

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
              <Text className="text-[11px] font-bold uppercase tracking-wider text-brand-foreground/80">
                Current due
              </Text>
              <Text className="mt-1 text-[40px] font-extrabold text-brand-foreground">
                {formatPaise(due.amountPaise)}
              </Text>
              <Text className="text-[13px] text-brand-foreground/80">
                Due {formatDate(due.dueDate)}
              </Text>
              <Button
                title="Pay now"
                variant="ghost"
                onPress={() => router.push(`/invoices/${due.id}`)}
                className="mt-3 self-start"
              />
            </Card>
          ) : null}

          <Card padded={false} className="px-4">
            <Text className="pt-4 text-[13px] font-bold uppercase tracking-wider text-ink3">
              History
            </Text>
            {data.map((inv, i) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                first={i === 0}
                onPress={() => router.push(`/invoices/${inv.id}`)}
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
  onPress,
}: {
  invoice: InvoiceSummary;
  first: boolean;
  onPress: () => void;
}) {
  const r = RICON[invoice.status] ?? RICON[InvoiceStatus.PENDING];
  const status = invoiceStatus(invoice.status);
  return (
    <Row
      first={first}
      onPress={onPress}
      leading={<Ricon name={r.name} className={r.bg} color={r.color} />}
      title={formatPeriod(invoice.period)}
      subtitle={formatPaise(invoice.amountPaise)}
      trailing={<Badge label={status.label} variant={status.variant} />}
    />
  );
}

function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
