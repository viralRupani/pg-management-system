import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useAnnouncements,
  useInvoices,
  useMenu,
  useNotifications,
} from '@/lib/queries';
import { InvoiceStatus, MealType } from '@pg/shared';
import { formatDate, formatPaise, ymd } from '@/lib/utils';

type QuickLink = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  href: string;
};

const QUICK_LINKS: QuickLink[] = [
  { icon: 'construct-outline', label: 'Complaints', href: '/(tabs)/complaints' },
  { icon: 'document-text-outline', label: 'Documents', href: '/documents' },
  { icon: 'shield-checkmark-outline', label: 'Deposit', href: '/deposit' },
  { icon: 'restaurant-outline', label: 'Mess', href: '/menu' },
];

export default function HomeScreen() {
  const router = useRouter();
  const today = useMemo(() => ymd(new Date()), []);
  const invoices = useInvoices();
  const announcements = useAnnouncements();
  const menu = useMenu(today, today);
  const notifications = useNotifications();

  const refreshing =
    invoices.isFetching || announcements.isFetching || menu.isFetching;
  const onRefresh = () => {
    invoices.refetch();
    announcements.refetch();
    menu.refetch();
    notifications.refetch();
  };

  const name = invoices.data?.[0]?.residentName?.split(' ')[0] ?? 'there';
  const dueInvoice = invoices.data?.find(
    (i) => i.status === InvoiceStatus.PENDING || i.status === InvoiceStatus.OVERDUE,
  );
  const latestAnnouncement = announcements.data?.items?.[0];
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  const meal = (type: MealType) =>
    menu.data?.find((m) => m.mealType === type)?.items;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-page">
      {/* Hero */}
      <View className="bg-brand px-5 pb-5 pt-2">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[13px] text-brand-foreground/80">
              {greeting()} 👋
            </Text>
            <Text className="mt-0.5 text-[22px] font-extrabold text-brand-foreground">
              {name}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/notifications')}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            {unread > 0 ? (
              <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger-dot" />
            ) : null}
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pb-8 pt-4 gap-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Rent status */}
        <Card>
          {dueInvoice ? (
            <>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                {formatPeriod(dueInvoice.period)} · Rent
              </Text>
              <View className="mt-1 flex-row items-end justify-between">
                <View>
                  <Text className="text-[30px] font-extrabold text-ink">
                    {formatPaise(dueInvoice.amountPaise)}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-ink2">
                    Due {formatDate(dueInvoice.dueDate)}
                  </Text>
                </View>
                <Button
                  title="Pay now"
                  size="sm"
                  onPress={() => router.push(`/invoices/${dueInvoice.id}`)}
                />
              </View>
            </>
          ) : (
            <View className="flex-row items-center gap-3">
              <Ionicons name="checkmark-circle" size={22} color="#15803d" />
              <Text className="text-[15px] font-semibold text-ink">
                You&apos;re all paid up.
              </Text>
            </View>
          )}
        </Card>

        {/* Quick links */}
        <View className="flex-row justify-between">
          {QUICK_LINKS.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => router.push(q.href)}
              className="w-[23%] items-center gap-1.5 active:opacity-60"
            >
              <View className="h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand-soft">
                <Ionicons name={q.icon} size={22} color="#0b7d73" />
              </View>
              <Text className="text-[12px] font-medium text-ink2">{q.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Latest announcement */}
        {latestAnnouncement ? (
          <Pressable onPress={() => router.push('/announcements')}>
            <Card>
              <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                📣 Latest announcement
              </Text>
              <Text className="mt-1.5 text-[15px] font-bold text-ink">
                {latestAnnouncement.title}
              </Text>
              <Text className="mt-1 text-[13px] text-ink2" numberOfLines={2}>
                {latestAnnouncement.body}
              </Text>
            </Card>
          </Pressable>
        ) : null}

        {/* Today's mess */}
        <Pressable onPress={() => router.push('/menu')}>
          <Card>
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                🍽️ Today&apos;s mess
              </Text>
              <Text className="text-[12px] font-semibold text-brand-deep">
                Full menu ›
              </Text>
            </View>
            <View className="mt-2 gap-2">
              <MealRow label="Breakfast" items={meal(MealType.BREAKFAST)} first />
              <MealRow label="Lunch" items={meal(MealType.LUNCH)} />
              <MealRow label="Dinner" items={meal(MealType.DINNER)} />
            </View>
          </Card>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MealRow({
  label,
  items,
  first = false,
}: {
  label: string;
  items?: string;
  first?: boolean;
}) {
  return (
    <View
      className={
        first
          ? 'flex-row justify-between'
          : 'flex-row justify-between border-t border-line2 pt-2'
      }
    >
      <Text className="text-[13px] font-semibold text-ink2">{label}</Text>
      <Text className="flex-1 text-right text-[13px] text-ink" numberOfLines={1}>
        {items ?? '—'}
      </Text>
    </View>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
