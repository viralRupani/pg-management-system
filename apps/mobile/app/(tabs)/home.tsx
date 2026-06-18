import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { invoiceStatus } from '@/components/ui/status';
import {
  useAnnouncements,
  useComplaints,
  useDeposit,
  useDocuments,
  useInvoices,
  useMenu,
  useNotifications,
} from '@/lib/queries';
import {
  ComplaintStatus,
  DepositStatus,
  DocumentStatus,
  InvoiceStatus,
  MealType,
} from '@pg/shared';
import { cn, formatDate, formatPaise, ymd } from '@/lib/utils';

export default function HomeScreen() {
  const router = useRouter();
  const today = useMemo(() => ymd(new Date()), []);
  const invoices = useInvoices();
  const announcements = useAnnouncements();
  const menu = useMenu(today, today);
  const notifications = useNotifications();
  const complaints = useComplaints();
  const documents = useDocuments();
  const deposit = useDeposit();

  const refreshing =
    invoices.isFetching ||
    announcements.isFetching ||
    menu.isFetching ||
    complaints.isFetching ||
    documents.isFetching ||
    deposit.isFetching ||
    notifications.isFetching;

  const onRefresh = () => {
    invoices.refetch();
    announcements.refetch();
    menu.refetch();
    notifications.refetch();
    complaints.refetch();
    documents.refetch();
    deposit.refetch();
  };

  const name = invoices.data?.[0]?.residentName?.split(' ')[0] ?? 'there';
  const dueInvoice = invoices.data?.find(
    (i) =>
      !i.deletedAt &&
      (i.status === InvoiceStatus.PENDING ||
        i.status === InvoiceStatus.OVERDUE),
  );
  const isOverdue = dueInvoice?.status === InvoiceStatus.OVERDUE;
  const rentBadge = dueInvoice ? invoiceStatus(dueInvoice.status) : null;
  const latestAnnouncement = announcements.data?.items?.[0];
  const unread = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  // --- "At a glance" strip values (surfaced from already-fetched data) ---
  const openComplaints =
    complaints.data?.filter(
      (c) =>
        c.status === ComplaintStatus.OPEN ||
        c.status === ComplaintStatus.IN_PROGRESS,
    ).length ?? 0;

  const docs = documents.data ?? [];
  const pendingDocs = docs.filter((d) => d.status === DocumentStatus.PENDING).length;
  const hasRejectedDoc = docs.some((d) => d.status === DocumentStatus.REJECTED);
  const kyc = !docs.length
    ? { value: 'Add', tone: 'text-ink' }
    : hasRejectedDoc
      ? { value: 'Action', tone: 'text-danger' }
      : pendingDocs
        ? { value: `${pendingDocs} pending`, tone: 'text-amber' }
        : { value: 'Verified', tone: 'text-success' };

  const dep = deposit.data?.deposit;
  const depLabel = dep
    ? dep.status === DepositStatus.SETTLED
      ? 'Deposit · Settled'
      : 'Deposit · Held'
    : 'Deposit';

  const meal = (type: MealType) =>
    menu.data?.find((m) => m.mealType === type)?.items;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-brand">
      <ScrollView
        className="bg-brand"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ffffff"
          />
        }
      >
        {/* Brand header (scrolls away; the rent card floats over its base) */}
        <View className="bg-brand px-5 pb-14 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] text-brand-foreground/80">
                {greeting()} 👋
              </Text>
              <Text
                className="mt-0.5 text-[23px] font-extrabold text-brand-foreground"
                numberOfLines={1}
              >
                {name}
              </Text>
            </View>
            <View className="flex-row items-center gap-2.5">
              <Pressable
                onPress={() => router.push('/notifications')}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/15 active:opacity-70"
              >
                <Ionicons name="notifications-outline" size={20} color="#fff" />
                {unread > 0 ? (
                  <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-brand bg-danger-dot" />
                ) : null}
              </Pressable>
              <Avatar name={name} size={40} className="border-2 border-white/25" />
            </View>
          </View>
        </View>

        {/* Page sheet — everything below sits on the neutral page background */}
        <View className="flex-1 gap-4 bg-page px-4 pb-8 pt-2">
          {/* Floating rent card (primary action) */}
          <View className="-mt-12">
            <Card className={cn(isOverdue && 'border-danger/40')}>
              {invoices.isLoading ? (
                <View className="gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-3 w-28" />
                </View>
              ) : dueInvoice && rentBadge ? (
                <>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                      {formatPeriod(dueInvoice.period)} · Rent
                    </Text>
                    <Badge label={rentBadge.label} variant={rentBadge.variant} />
                  </View>
                  <View className="mt-2 flex-row items-end justify-between">
                    <View>
                      <Text className="text-[30px] font-extrabold text-ink">
                        {formatPaise(dueInvoice.amountPaise)}
                      </Text>
                      <Text
                        className={cn(
                          'mt-0.5 text-[13px]',
                          isOverdue ? 'font-semibold text-danger' : 'text-ink2',
                        )}
                      >
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
                  <Ionicons name="checkmark-circle" size={26} color="#15803d" />
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-ink">
                      You&apos;re all paid up.
                    </Text>
                    <Text className="text-[12px] text-ink2">
                      No rent due right now.
                    </Text>
                  </View>
                </View>
              )}
            </Card>
          </View>

          {/* At a glance */}
          <View className="flex-row gap-3">
            <GlanceTile
              icon="construct-outline"
              label="Complaints"
              value={openComplaints ? `${openComplaints} open` : 'All clear'}
              tone={openComplaints ? 'text-amber' : 'text-success'}
              loading={complaints.isLoading}
              onPress={() => router.push('/(tabs)/complaints')}
            />
            <GlanceTile
              icon="document-text-outline"
              label="KYC"
              value={kyc.value}
              tone={kyc.tone}
              loading={documents.isLoading}
              onPress={() => router.push('/documents')}
            />
            <GlanceTile
              icon="shield-checkmark-outline"
              label={depLabel}
              value={dep ? formatPaise(dep.amountPaise) : '—'}
              tone="text-ink"
              loading={deposit.isLoading}
              onPress={() => router.push('/deposit')}
            />
          </View>

          {/* Latest announcement */}
          {latestAnnouncement ? (
            <Pressable
              onPress={() => router.push('/announcements')}
              className="active:opacity-70"
            >
              <Card>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                    📣 Announcement
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </View>
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
          <Pressable
            onPress={() => router.push('/menu')}
            className="active:opacity-70"
          >
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-ink3">
                  🍽️ Today&apos;s mess
                </Text>
                <Text className="text-[12px] font-semibold text-brand-deep">
                  Full menu ›
                </Text>
              </View>
              <View className="mt-2.5 gap-2.5">
                <MealRow label="Breakfast" items={meal(MealType.BREAKFAST)} first />
                <MealRow label="Lunch" items={meal(MealType.LUNCH)} />
                <MealRow label="Dinner" items={meal(MealType.DINNER)} />
              </View>
            </Card>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One compact stat in the "at a glance" strip. */
function GlanceTile({
  icon,
  label,
  value,
  tone = 'text-ink',
  loading = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-70">
      <Card className="gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-[11px] bg-brand-soft">
          <Ionicons name={icon} size={18} color="#0b7d73" />
        </View>
        {loading ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <Text
            className={cn('text-[15px] font-extrabold', tone)}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        <Text className="text-[11px] font-medium text-ink2" numberOfLines={1}>
          {label}
        </Text>
      </Card>
    </Pressable>
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
          : 'flex-row justify-between border-t border-line2 pt-2.5'
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
