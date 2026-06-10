import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { qk, useNotifications } from '@/lib/queries';
import { cn, timeAgo } from '@/lib/utils';
import type { NotificationSummary } from '@pg/shared';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  ANNOUNCEMENT: 'megaphone-outline',
  RENT: 'wallet-outline',
  PAYMENT: 'wallet-outline',
  COMPLAINT: 'chatbubble-ellipses-outline',
  KYC: 'document-text-outline',
  DOCUMENT: 'document-text-outline',
};

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useNotifications();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: qk.notifications });

  async function markRead(n: NotificationSummary) {
    if (n.readAt) return;
    await api.resident.notifications.markRead(n.id);
    invalidate();
  }

  async function markAll() {
    const unread = data?.filter((n) => !n.readAt) ?? [];
    await Promise.all(unread.map((n) => api.resident.notifications.markRead(n.id)));
    invalidate();
  }

  const hasUnread = data?.some((n) => !n.readAt) ?? false;

  return (
    <Screen
      scroll
      contentClassName="gap-2"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar
        title="Notifications"
        action={
          hasUnread ? (
            <Pressable onPress={markAll}>
              <Text className="text-[13px] font-semibold text-brand-deep">
                Mark all read
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      {isLoading ? (
        <ListSkeleton />
      ) : !data?.length ? (
        <EmptyState
          icon="notifications-outline"
          title="You're all caught up"
          description="Updates about rent, complaints, and notices will show here."
        />
      ) : (
        data.map((n) => {
          const unread = !n.readAt;
          return (
            <Pressable
              key={n.id}
              onPress={() => markRead(n)}
              className={cn(
                'flex-row gap-3 rounded-card border border-line p-3.5',
                unread ? 'bg-brand-soft' : 'bg-surface',
              )}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
                <Ionicons
                  name={ICON[n.type] ?? 'notifications-outline'}
                  size={18}
                  color="#0b7d73"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-semibold text-ink">{n.title}</Text>
                <Text className="mt-0.5 text-[13px] text-ink2">{n.body}</Text>
                <Text className="mt-1 text-[11px] text-ink3">{timeAgo(n.createdAt)}</Text>
              </View>
              {unread ? (
                <View className="mt-1 h-2.5 w-2.5 rounded-full bg-info-dot" />
              ) : null}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
