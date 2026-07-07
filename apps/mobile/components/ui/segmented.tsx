import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

/**
 * Segmented control with a sliding thumb — for small mutually-exclusive sets
 * (filters, payment method, appearance). For >4 options use Chips instead.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const thumbWidth = width > 0 ? (width - 8) / options.length : 0;
  const x = useSharedValue(index * thumbWidth);
  // A brief scale pop gives the transition life without any horizontal
  // overshoot (translateX bounce spills the thumb off-screen at the last tab).
  const pop = useSharedValue(1);

  useEffect(() => {
    // Glide the position smoothly — no overshoot, so it never leaves its slot.
    x.value = withSpring(index * thumbWidth, {
      damping: 26,
      stiffness: 240,
      overshootClamping: true,
    });
    // Grows from the thumb's center, so it can't run past the screen edge.
    pop.value = withSequence(
      withTiming(1.06, { duration: 110 }),
      withSpring(1, { damping: 14, stiffness: 260 }),
    );
  }, [index, thumbWidth, x, pop]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: pop.value }],
  }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className={cn('flex-row rounded-pill bg-surface2 p-1', className)}
    >
      {thumbWidth > 0 ? (
        <Animated.View
          style={[thumbStyle, { position: 'absolute', top: 4, bottom: 4, left: 4, width: thumbWidth }]}
          className="rounded-pill border border-line bg-surface shadow-sm shadow-black/10"
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            haptic="selection"
            pressedScale={0.98}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className="min-h-[36px] flex-1 items-center justify-center rounded-pill"
          >
            <AppText variant="label" className={selected ? 'text-ink' : 'text-ink3'}>
              {option.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}
