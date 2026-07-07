import { RefreshControl, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { AppText } from '@/components/ui/text';
import { useAnnouncements } from '@/lib/queries';
import { formatDate, timeAgo } from '@/lib/utils';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export default function AnnouncementsScreen() {
  const { data, isLoading, isError, isFetching, refetch } = useAnnouncements();
  const items = data?.items ?? [];

  return (
    <Screen
      contentClassName="gap-3"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar title="Announcements" />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load announcements" onRetry={() => refetch()} />
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
            <Card key={a.id} className={isNew ? 'border-brand-line' : undefined}>
              {/* Accent rail for fresh notices */}
              {isNew ? (
                <View className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full bg-brand" />
              ) : null}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <AppText variant="caption" className="uppercase tracking-wider">
                    📣 Notice
                  </AppText>
                  {isNew && <Badge label="New" variant="info" />}
                </View>
                <AppText variant="caption" className="text-[12px]">
                  {isNew ? timeAgo(a.createdAt) : formatDate(a.createdAt)}
                </AppText>
              </View>
              <AppText variant="body" weight="bold" className="mt-1.5">
                {a.title}
              </AppText>
              <AppText variant="sub" className="mt-1 leading-5">
                {a.body}
              </AppText>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
