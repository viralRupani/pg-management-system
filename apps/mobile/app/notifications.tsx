import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshControl, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { AppText } from '@/components/ui/text';
import { api } from '@/lib/api';
import { qk, useNotifications } from '@/lib/queries';
import { cn, timeAgo } from '@/lib/utils';
import type { NotificationSummary } from '@pg/shared';

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  ANNOUNCEMENT: 'megaphone-outline',
  RENT: 'wallet-outline',
  RENT_REMINDER: 'wallet-outline',
  PAYMENT: 'wallet-outline',
  PAYMENT_APPROVED: 'checkmark-circle-outline',
  PAYMENT_REJECTED: 'close-circle-outline',
  COMPLAINT: 'chatbubble-ellipses-outline',
  KYC: 'document-text-outline',
  DOCUMENT: 'document-text-outline',
};

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const tokens = useTokens();
  const { data, isLoading, isError, isFetching, refetch } = useNotifications();

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
            <PressableScale onPress={markAll} accessibilityRole="button" className="min-h-[36px] justify-center">
              <AppText variant="label" className="text-brand-deep">
                Mark all read
              </AppText>
            </PressableScale>
          ) : undefined
        }
      />

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load notifications" onRetry={() => refetch()} />
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
            <PressableScale
              key={n.id}
              onPress={() => markRead(n)}
              pressedScale={0.99}
              accessibilityRole="button"
              className={cn(
                'flex-row gap-3 rounded-card border border-line p-3.5',
                unread ? 'bg-brand-soft' : 'bg-surface',
              )}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-surface">
                <Ionicons
                  name={ICON[n.type] ?? 'notifications-outline'}
                  size={18}
                  color={tokens.brandDeep}
                />
              </View>
              <View className="flex-1">
                <AppText variant="body" weight="semibold" className="text-[14px]">
                  {n.title}
                </AppText>
                <AppText variant="sub" className="mt-0.5">
                  {n.body}
                </AppText>
                <AppText variant="caption" className="mt-1">
                  {timeAgo(n.createdAt)}
                </AppText>
              </View>
              {unread ? (
                <View className="mt-1 h-2.5 w-2.5 rounded-full bg-info-dot" />
              ) : null}
            </PressableScale>
          );
        })
      )}
    </Screen>
  );
}
