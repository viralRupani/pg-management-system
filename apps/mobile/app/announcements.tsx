import { RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAnnouncements } from '@/lib/queries';
import { formatDate } from '@/lib/utils';

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
        items.map((a) => (
          <Card key={a.id}>
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                📣 Notice
              </Text>
              <Text className="text-[12px] text-ink3">{formatDate(a.createdAt)}</Text>
            </View>
            <Text className="mt-1.5 text-[15px] font-bold text-ink">{a.title}</Text>
            <Text className="mt-1 text-[13px] leading-5 text-ink2">{a.body}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
