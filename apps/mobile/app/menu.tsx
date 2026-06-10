import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Appbar } from '@/components/ui/appbar';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ListSkeleton } from '@/components/ui/skeleton';
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
  const { data, isLoading, isFetching, refetch } = useMenu(from, to);
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

      <View className="flex-row items-center justify-between rounded-btn bg-brand-soft px-2 py-1.5">
        <Pressable onPress={() => setWeek((w) => w - 1)} className="p-2">
          <Ionicons name="chevron-back" size={20} color="#0b7d73" />
        </Pressable>
        <Text className="text-[14px] font-bold text-brand-deep">
          {week === 0 ? 'This week' : rangeLabel}
        </Text>
        <Pressable onPress={() => setWeek((w) => w + 1)} className="p-2">
          <Ionicons name="chevron-forward" size={20} color="#0b7d73" />
        </Pressable>
      </View>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : (
        days.map((d, i) => {
          const dYmd = ymd(d);
          const isToday = dYmd === todayYmd;
          return (
            <Card key={dYmd} className="flex-row gap-3">
              <View
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-[12px]',
                  isToday ? 'bg-brand' : 'bg-page',
                )}
              >
                <Text className={cn('text-[11px] font-bold', isToday ? 'text-brand-foreground' : 'text-ink2')}>
                  {DAY_NAMES[i]}
                </Text>
                <Text className={cn('text-[14px] font-extrabold', isToday ? 'text-brand-foreground' : 'text-ink')}>
                  {d.getDate()}
                </Text>
              </View>
              <View className="flex-1 gap-1.5">
                {MEALS.map((m) => (
                  <View key={m.type}>
                    <Text className="text-[10px] font-bold uppercase tracking-wider text-ink3">
                      {m.label}
                    </Text>
                    <Text className="text-[13px] text-ink" numberOfLines={2}>
                      {mealFor(dYmd, m.type) ?? '—'}
                    </Text>
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
