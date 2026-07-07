import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { AppText } from '@/components/ui/text';
import { formatDate, ymd } from '@/lib/utils';
import { cn } from '@/lib/utils';

// Hand-rolled labels — Hermes Intl month names are unreliable on Android.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * Pure-JS month-grid date picker in a bottom sheet — the native Android dialog
 * ignores the app's brand/dark tokens, this one is fully theme-aware. Tap a day,
 * confirm; emits a local `Date` (callers format with `ymd()`, never ISO/UTC).
 */
export function CalendarSheet({
  visible,
  onClose,
  onSelect,
  value,
  minDate,
  title = 'Pick a date',
  subtitle,
  confirmLabel = 'Confirm',
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
  value?: Date | null;
  minDate?: Date;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
}) {
  const tokens = useTokens();
  const min = minDate ? dayStart(minDate) : null;
  const [selected, setSelected] = useState<Date | null>(value ?? null);
  const [month, setMonth] = useState(() => monthStart(value ?? minDate ?? new Date()));

  useEffect(() => {
    if (visible) {
      setSelected(value ?? null);
      setMonth(monthStart(value ?? minDate ?? new Date()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const today = dayStart(new Date());
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = month.getDay(); // 0 = Sunday-first grid
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const canGoPrev = !min || month.getTime() > monthStart(min).getTime();

  return (
    <Sheet visible={visible} animated={true} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Month pager */}
      <View className="flex-row items-center justify-between">
        <PressableScale
          onPress={() => canGoPrev && setMonth(addMonths(month, -1))}
          disabled={!canGoPrev}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full border border-line bg-surface',
            !canGoPrev && 'opacity-30',
          )}
        >
          <Ionicons name="chevron-back" size={18} color={tokens.ink2} />
        </PressableScale>
        <AppText variant="heading">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </AppText>
        <PressableScale
          onPress={() => setMonth(addMonths(month, 1))}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Next month"
          className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface"
        >
          <Ionicons name="chevron-forward" size={18} color={tokens.ink2} />
        </PressableScale>
      </View>

      {/* Weekday header */}
      <View className="flex-row">
        {WEEKDAYS.map((d, i) => (
          <View key={i} className="flex-1 items-center py-1">
            <AppText variant="caption" className="uppercase">
              {d}
            </AppText>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View className="flex-row flex-wrap">
        {cells.map((date, i) => {
          if (!date) return <View key={`b${i}`} className="h-[44px] w-[14.28%]" />;
          const disabled = Boolean(min && date.getTime() < min.getTime());
          const isSelected = Boolean(selected && date.getTime() === dayStart(selected).getTime());
          const isToday = date.getTime() === today.getTime();
          return (
            <View key={ymd(date)} className="h-[44px] w-[14.28%] items-center justify-center">
              <PressableScale
                onPress={() => setSelected(date)}
                disabled={disabled}
                haptic="selection"
                pressedScale={0.9}
                accessibilityRole="button"
                accessibilityLabel={formatDate(ymd(date))}
                accessibilityState={{ selected: isSelected, disabled }}
                className={cn(
                  'h-10 w-10 items-center justify-center rounded-full',
                  isSelected ? 'bg-brand' : isToday ? 'border border-brand-line' : undefined,
                  disabled && 'opacity-30',
                )}
              >
                <AppText
                  variant="label"
                  className={cn(
                    'text-[14px]',
                    isSelected ? 'text-brand-foreground' : isToday ? 'text-brand-deep' : 'text-ink',
                  )}
                >
                  {date.getDate()}
                </AppText>
              </PressableScale>
            </View>
          );
        })}
      </View>

      <Button
        title={selected ? `${confirmLabel} · ${formatDate(ymd(selected))}` : 'Pick a date'}
        disabled={!selected}
        onPress={() => {
          if (selected) {
            onSelect(selected);
            onClose();
          }
        }}
      />
    </Sheet>
  );
}
