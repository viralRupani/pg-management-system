import { Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = PressableProps & {
  className?: string;
  /** Fire a haptic on press-in. */
  haptic?: 'selection' | 'tap' | 'none';
  /** How far to shrink when pressed (1 = none). */
  pressedScale?: number;
};

/**
 * The app's tactile Pressable: springs to a slight shrink + dim on press-in.
 * Replaces the old `active:opacity-*` classes — use this for every tappable
 * surface (buttons, rows, tiles, chips, tab items).
 */
export function PressableScale({
  haptic = 'none',
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  style,
  ...props
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - pressedScale) }],
    opacity: 1 - pressed.value * 0.1,
  }));

  return (
    <AnimatedPressable
      style={[animatedStyle, style as never]}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 80 });
        if (haptic !== 'none') haptics[haptic]();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, { damping: 18, stiffness: 300 });
        onPressOut?.(e);
      }}
      {...props}
    />
  );
}
