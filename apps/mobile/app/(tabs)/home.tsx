import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTokens } from '@/components/theme-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { invoiceStatus } from '@/components/ui/status';
import { AppText } from '@/components/ui/text';
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
import { cn, formatDate, formatPaise, timeAgo, ymd } from '@/lib/utils';

export default function HomeScreen() {
  const router = useRouter();
  const tokens = useTokens();
  // The pager keeps all tabs mounted, so track focus explicitly for StatusBar.
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
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
  // Surface the *earliest* unpaid invoice first (oldest period), so paying it
  // reveals the next month — not the newest bill ahead of an older unpaid one.
  const dueInvoice = useMemo(
    () =>
      (invoices.data ?? [])
        .filter(
          (i) =>
            !i.deletedAt &&
            !i.underReview &&
            (i.status === InvoiceStatus.PENDING ||
              i.status === InvoiceStatus.OVERDUE),
        )
        .sort((a, b) => a.period.localeCompare(b.period))[0],
    [invoices.data],
  );
  // When nothing is left to pay, an invoice whose payment is awaiting the
  // manager's review still shouldn't read as "all paid up" — surface it instead.
  const reviewInvoice = useMemo(
    () =>
      (invoices.data ?? [])
        .filter((i) => !i.deletedAt && i.underReview)
        .sort((a, b) => a.period.localeCompare(b.period))[0],
    [invoices.data],
  );
  const isOverdue = dueInvoice?.status === InvoiceStatus.OVERDUE;
  const rentBadge = dueInvoice ? invoiceStatus(dueInvoice.status) : null;
  const recentAnnouncements = useMemo(
    () =>
      (announcements.data?.items ?? []).filter(
        (a) => Date.now() - new Date(a.createdAt).getTime() <= 2 * 24 * 60 * 60 * 1000,
      ),
    [announcements.data],
  );
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
      {/* The brand header sits behind the status bar — match its foreground.
          Only while focused: the pager keeps all tabs mounted. */}
      {isFocused ? (
        <StatusBar style={tokens.statusBarOnBrand} />
      ) : null}
      <ScrollView
        className="bg-brand"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.brandForeground}
            colors={[tokens.brand]}
            progressBackgroundColor={tokens.surface}
          />
        }
      >
        {/* Brand header (scrolls away; the rent card floats over its base) */}
        <View className="bg-brand px-5 pb-14 pt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <AppText variant="sub" className="text-brand-foreground-dim">
                {greeting()} 👋
              </AppText>
              <AppText
                variant="title"
                weight="heavy"
                className="mt-0.5 text-[23px] text-brand-foreground"
                numberOfLines={1}
              >
                {name}
              </AppText>
            </View>
            <View className="flex-row items-center gap-2.5">
              <PressableScale
                onPress={() => router.push('/notifications')}
                pressedScale={0.9}
                accessibilityRole="button"
                accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
              >
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color={tokens.brandForeground}
                />
                {unread > 0 ? (
                  <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-brand bg-danger-dot" />
                ) : null}
              </PressableScale>
              <PressableScale
                onPress={() => router.push('/(tabs)/more')}
                pressedScale={0.9}
                accessibilityRole="button"
                accessibilityLabel="Profile"
              >
                <Avatar name={name} size={40} className="border-2 border-white/25" />
              </PressableScale>
            </View>
          </View>
        </View>

        {/* Page sheet — everything below sits on the neutral page background */}
        <View className="flex-1 gap-4 bg-page px-4 pb-8 pt-2">
          {/* Floating rent card (primary action) */}
          <Animated.View entering={FadeInDown.duration(350)} className="-mt-12">
            <Card className={cn(isOverdue && 'border-danger-line')}>
              {invoices.isLoading ? (
                <View className="gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-3 w-28" />
                </View>
              ) : invoices.isError ? (
                <View className="flex-row items-center gap-3">
                  <Ionicons name="cloud-offline-outline" size={24} color={tokens.danger} />
                  <View className="flex-1">
                    <AppText variant="body" weight="semibold">
                      Couldn&apos;t load your rent
                    </AppText>
                    <AppText variant="sub" className="text-[12px]">
                      Pull down to retry.
                    </AppText>
                  </View>
                  <Button
                    title="Retry"
                    variant="ghost"
                    size="sm"
                    onPress={() => invoices.refetch()}
                  />
                </View>
              ) : dueInvoice && rentBadge ? (
                <>
                  <View className="flex-row items-center justify-between">
                    <AppText variant="caption" className="uppercase tracking-wider">
                      {formatPeriod(dueInvoice.period)} · Rent
                    </AppText>
                    <Badge label={rentBadge.label} variant={rentBadge.variant} />
                  </View>
                  <View className="mt-2 flex-row items-end justify-between">
                    <View>
                      <AppText variant="display" className="text-[32px] leading-[38px]">
                        {formatPaise(dueInvoice.amountPaise)}
                      </AppText>
                      <View className="mt-1 flex-row items-center gap-1.5">
                        {isOverdue ? <PulseDot /> : null}
                        <AppText
                          variant="sub"
                          weight={isOverdue ? 'semibold' : 'regular'}
                          className={isOverdue ? 'text-danger' : 'text-ink2'}
                        >
                          Due {formatDate(dueInvoice.dueDate)}
                        </AppText>
                      </View>
                    </View>
                    <Button
                      title="Pay now"
                      size="sm"
                      onPress={() => router.push(`/invoices/${dueInvoice.id}`)}
                    />
                  </View>
                </>
              ) : reviewInvoice ? (
                <PressableScale
                  pressedScale={0.99}
                  onPress={() => router.push(`/invoices/${reviewInvoice.id}`)}
                  className="flex-row items-center gap-3"
                >
                  <Ionicons name="hourglass-outline" size={24} color={tokens.info} />
                  <View className="flex-1">
                    <AppText variant="body" weight="semibold">
                      Payment under review
                    </AppText>
                    <AppText variant="sub" className="text-[12px]">
                      {formatPeriod(reviewInvoice.period)} · your manager is confirming it.
                    </AppText>
                  </View>
                  <Badge label="Under review" variant="info" />
                </PressableScale>
              ) : (
                <View className="flex-row items-center gap-3">
                  <Ionicons name="checkmark-circle" size={26} color={tokens.success} />
                  <View className="flex-1">
                    <AppText variant="body" weight="semibold">
                      You&apos;re all paid up.
                    </AppText>
                    <AppText variant="sub" className="text-[12px]">
                      No rent due right now.
                    </AppText>
                  </View>
                </View>
              )}
            </Card>
          </Animated.View>

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

          {/* Announcements — recent ones inline; always shows a "See all" entry */}
          <View className="gap-2">
            <SectionHeader
              title="Notices"
              action="See all"
              onAction={() => router.push('/announcements')}
            />
            {recentAnnouncements.length > 0 ? (
              recentAnnouncements.map((a) => (
                <PressableScale
                  key={a.id}
                  pressedScale={0.99}
                  onPress={() => router.push('/announcements')}
                >
                  <Card>
                    <View className="flex-row items-start justify-between gap-2">
                      <AppText
                        variant="body"
                        weight="bold"
                        className="flex-1"
                        numberOfLines={1}
                      >
                        {a.title}
                      </AppText>
                      <AppText variant="caption" className="shrink-0">
                        {timeAgo(a.createdAt)}
                      </AppText>
                    </View>
                    <AppText variant="sub" className="mt-1 leading-5" numberOfLines={2}>
                      {a.body}
                    </AppText>
                  </Card>
                </PressableScale>
              ))
            ) : (
              <PressableScale
                pressedScale={0.99}
                onPress={() => router.push('/announcements')}
              >
                <Card className="flex-row items-center justify-between bg-page">
                  <View className="flex-row items-center gap-2.5">
                    <Ionicons name="megaphone-outline" size={18} color={tokens.ink3} />
                    <AppText variant="sub" className="text-ink3">
                      No new notices in the last 2 days
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={tokens.ink3} />
                </Card>
              </PressableScale>
            )}
          </View>

          {/* Today's mess */}
          <PressableScale pressedScale={0.99} onPress={() => router.push('/menu')}>
            <Card>
              <View className="flex-row items-center justify-between">
                <AppText variant="caption" className="uppercase tracking-wider">
                  🍽️ Today&apos;s mess
                </AppText>
                <AppText variant="label" className="text-[12px] text-brand-deep">
                  Full menu ›
                </AppText>
              </View>
              <View className="mt-2.5 gap-2.5">
                <MealRow label="Breakfast" items={meal(MealType.BREAKFAST)} first />
                <MealRow label="Lunch" items={meal(MealType.LUNCH)} />
                <MealRow label="Dinner" items={meal(MealType.DINNER)} />
              </View>
            </Card>
          </PressableScale>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Slow-blinking dot for the overdue state. */
function PulseDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.25, { duration: 650 }), withTiming(1, { duration: 650 })),
      -1,
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className="h-2 w-2 rounded-full bg-danger-dot" />;
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
  const tokens = useTokens();
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" className="flex-1">
      <Card className="gap-2">
        <View className="h-9 w-9 items-center justify-center rounded-[11px] bg-brand-soft">
          <Ionicons name={icon} size={18} color={tokens.brandDeep} />
        </View>
        {loading ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <AppText
            variant="body"
            weight="heavy"
            className={cn(tone)}
            numberOfLines={1}
          >
            {value}
          </AppText>
        )}
        <AppText variant="caption" weight="medium" className="text-ink2" numberOfLines={1}>
          {label}
        </AppText>
      </Card>
    </PressableScale>
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
      <AppText variant="sub" weight="semibold">
        {label}
      </AppText>
      <AppText variant="sub" className="flex-1 text-right text-ink" numberOfLines={1}>
        {items ?? '—'}
      </AppText>
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
