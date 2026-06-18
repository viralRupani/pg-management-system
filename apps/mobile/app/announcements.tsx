import { RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAnnouncements } from '@/lib/queries';
import { formatDate, timeAgo } from '@/lib/utils';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export default function AnnouncementsScreen() {
  const { data, isLoading, isFetching, refetch } = useAnnouncements();
  const items = data?.items ?? [];

  return (
    <Screen
      contentClassName="gap-3"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar title="Announcements" />

      {isLoading ? (
        <ListSkeleton />
      ) : !items.length ? (
        <EmptyState
          icon="megaphone-outline"
          title="No announcements"
          description="Notices from your PG manager will appear here."
        />
      ) : (
        items.map((a) => {
          const isNew = Date.now() - new Date(a.createdAt).getTime() <= TWO_DAYS_MS;
          return (
            <Card key={a.id} className={isNew ? 'border-brand/40' : undefined}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                    📣 Notice
                  </Text>
                  {isNew && <Badge label="New" variant="info" />}
                </View>
                <Text className="text-[12px] text-ink3">
                  {isNew ? timeAgo(a.createdAt) : formatDate(a.createdAt)}
                </Text>
              </View>
              <Text className="mt-1.5 text-[15px] font-bold text-ink">{a.title}</Text>
              <Text className="mt-1 text-[13px] leading-5 text-ink2">{a.body}</Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
