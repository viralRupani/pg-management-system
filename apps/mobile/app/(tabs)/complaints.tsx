import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { categoryMeta } from '@/components/ui/categories';
import { Chip, ChipRow } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Fab } from '@/components/ui/fab';
import { Row, Ricon } from '@/components/ui/row';
import { ListSkeleton } from '@/components/ui/skeleton';
import { complaintStatus } from '@/components/ui/status';
import { AppText } from '@/components/ui/text';
import { useComplaints } from '@/lib/queries';
import { ComplaintStatus } from '@pg/shared';
import { timeAgo } from '@/lib/utils';

const FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Open', value: ComplaintStatus.OPEN },
  { label: 'In progress', value: ComplaintStatus.IN_PROGRESS },
  { label: 'Resolved', value: ComplaintStatus.RESOLVED },
] as const;

export default function ComplaintsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isFetching, refetch } = useComplaints();
  const [filter, setFilter] = useState<string>('ALL');

  const items =
    filter === 'ALL' ? data : data?.filter((c) => c.status === filter);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-page">
      <AppText variant="title" weight="heavy" className="px-4 pb-3 pt-1 text-[25px]">
        Complaints
      </AppText>

      <View className="pb-3">
        <ChipRow>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              active={filter === f.value}
              onPress={() => setFilter(f.value)}
            />
          ))}
        </ChipRow>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-24"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState title="Couldn't load complaints" onRetry={() => refetch()} />
        ) : !items?.length ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No complaints here"
            description="Raise a complaint and track its progress with your manager."
            actionLabel="Raise a complaint"
            onAction={() => router.push('/complaints/new')}
          />
        ) : (
          <Card padded={false} className="px-4">
            {items.map((c, i) => {
              const meta = categoryMeta(c.category);
              const status = complaintStatus(c.status);
              return (
                <Row
                  key={c.id}
                  first={i === 0}
                  onPress={() => router.push(`/complaints/${c.id}`)}
                  leading={<Ricon name={meta.icon} />}
                  title={c.description}
                  subtitle={`${meta.label} · ${timeAgo(c.createdAt)}`}
                  trailing={<Badge label={status.label} variant={status.variant} />}
                />
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Fab
        onPress={() => router.push('/complaints/new')}
        accessibilityLabel="Raise a complaint"
      />
    </SafeAreaView>
  );
}
