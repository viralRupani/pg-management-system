import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTokens } from '@/components/theme-provider';
import { Card } from './card';
import { cn } from '@/lib/utils';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

/** A shimmering placeholder block. Width/height via className. */
export function Skeleton({ className }: { className?: string }) {
  const tokens = useTokens();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1200 }), -1);
  }, [progress]);

  const sweep = useAnimatedStyle(
    () => ({
      transform: [{ translateX: -width + progress.value * 2 * width }],
    }),
    [width],
  );

  const highlight =
    tokens.scheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.65)';

  return (
    <View
      className={cn('overflow-hidden rounded-md bg-surface2', className)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <AnimatedGradient
          colors={['transparent', highlight, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[{ position: 'absolute', top: 0, bottom: 0, width }, sweep]}
        />
      ) : null}
    </View>
  );
}

/** A few stacked card+row skeletons for list loading states. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-[42px] w-[42px] rounded-[12px]" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </View>
        </View>
      ))}
    </Card>
  );
}
