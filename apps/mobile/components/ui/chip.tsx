import { Pressable, ScrollView, Text } from 'react-native';

import { cn } from '@/lib/utils';

/** A filter pill (design `.chip`); `active` fills with the brand accent. */
export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-pill border px-3.5 py-2 active:opacity-70',
        active ? 'border-brand bg-brand' : 'border-line bg-surface',
      )}
    >
      <Text
        className={cn(
          'text-[13px] font-semibold',
          active ? 'text-brand-foreground' : 'text-ink2',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A horizontally scrollable row of chips. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="flex-row gap-2 px-4"
    >
      {children}
    </ScrollView>
  );
}
