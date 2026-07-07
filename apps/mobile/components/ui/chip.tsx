import { ScrollView } from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
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
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        'min-h-[36px] justify-center rounded-pill border px-3.5 py-1.5',
        active ? 'border-brand bg-brand' : 'border-line bg-surface',
      )}
    >
      <AppText
        variant="label"
        className={active ? 'text-brand-foreground' : 'text-ink2'}
      >
        {label}
      </AppText>
    </PressableScale>
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
