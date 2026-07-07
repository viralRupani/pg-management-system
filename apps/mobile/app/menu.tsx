import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Appbar } from '@/components/ui/appbar';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
import { AppText } from '@/components/ui/text';
import { useMenu, useMenuConfig } from '@/lib/queries';
import { MealType } from '@pg/shared';
import { cn, ymd } from '@/lib/utils';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEALS: { type: MealType; label: string }[] = [
  { type: MealType.BREAKFAST, label: 'Breakfast' },
  { type: MealType.LUNCH, label: 'Lunch' },
  { type: MealType.DINNER, label: 'Dinner' },
];

function mondayOf(offsetWeeks: number): Date {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function MenuScreen() {
  const tokens = useTokens();
  const [week, setWeek] = useState(0);
  useMenuConfig(); // auto-inits the cycle config server-side on first call

  const days = useMemo(() => {
    const monday = mondayOf(week);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [week]);

  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const { data, isLoading, isError, isFetching, refetch } = useMenu(from, to);
  const todayYmd = ymd(new Date());

  const mealFor = (dateYmd: string, type: MealType) =>
    data?.find((m) => m.menuDate === dateYmd && m.mealType === type)?.items;

  const rangeLabel = `${days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

  return (
    <Screen
      contentClassName="gap-3"
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
    >
      <Appbar title="Mess menu" />

      <View className="flex-row items-center justify-between rounded-pill bg-brand-soft px-1.5 py-1">
        <PressableScale
          onPress={() => setWeek((w) => w - 1)}
          haptic="selection"
          pressedScale={0.85}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Ionicons name="chevron-back" size={20} color={tokens.brandDeep} />
        </PressableScale>
        <AppText variant="label" className="text-[14px] text-brand-deep">
          {week === 0 ? 'This week' : rangeLabel}
        </AppText>
        <PressableScale
          onPress={() => setWeek((w) => w + 1)}
          haptic="selection"
          pressedScale={0.85}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Ionicons name="chevron-forward" size={20} color={tokens.brandDeep} />
        </PressableScale>
      </View>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : isError ? (
        <ErrorState title="Couldn't load the menu" onRetry={() => refetch()} />
      ) : (
        days.map((d, i) => {
          const dYmd = ymd(d);
          const isToday = dYmd === todayYmd;
          return (
            <Card key={dYmd} className={cn('flex-row gap-3', isToday && 'border-brand-line')}>
              <View
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-[12px]',
                  isToday ? 'bg-brand' : 'bg-page',
                )}
              >
                <AppText
                  variant="caption"
                  weight="bold"
                  className={isToday ? 'text-brand-foreground' : 'text-ink2'}
                >
                  {DAY_NAMES[i]}
                </AppText>
                <AppText
                  variant="body"
                  weight="heavy"
                  className={cn('text-[14px] leading-[18px]', isToday ? 'text-brand-foreground' : 'text-ink')}
                >
                  {d.getDate()}
                </AppText>
              </View>
              <View className="flex-1 gap-1.5">
                {MEALS.map((m) => (
                  <View key={m.type}>
                    <AppText variant="caption" weight="bold" className="text-[10px] uppercase tracking-wider">
                      {m.label}
                    </AppText>
                    <AppText variant="sub" className="text-ink" numberOfLines={2}>
                      {mealFor(dYmd, m.type) ?? '—'}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
