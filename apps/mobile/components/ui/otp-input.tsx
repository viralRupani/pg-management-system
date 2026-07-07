import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

function Cell({ char, active, errored }: { char: string; active: boolean; errored: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (char) {
      scale.value = 1.1;
      scale.value = withSpring(1, { damping: 12, stiffness: 320 });
    }
  }, [char, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={style}
      className={cn(
        'h-[54px] flex-1 items-center justify-center rounded-field border-[1.5px] bg-surface',
        errored
          ? 'border-danger-dot'
          : active
            ? 'border-brand bg-brand-soft'
            : char
              ? 'border-brand-line'
              : 'border-line',
      )}
    >
      <AppText variant="title" className="text-[22px]">
        {char}
      </AppText>
    </Animated.View>
  );
}

/**
 * Six-cell OTP field driven by one hidden TextInput. Fires `onComplete` the
 * moment the last digit lands (auto-submit — no extra tap). Set `error` to
 * shake the row + error haptic; it clears visually on the next keystroke.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  /** Truthy = show error styling and shake. */
  error?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (error) {
      haptics.error();
      shake.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8, { duration: 55 }),
        withTiming(-5, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [error, shake]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="One-time code">
      <Animated.View style={rowStyle} className="flex-row gap-2">
        {Array.from({ length }).map((_, i) => (
          <Cell
            key={i}
            char={value[i] ?? ''}
            active={focused && i === Math.min(value.length, length - 1) && value.length < length}
            errored={Boolean(error)}
          />
        ))}
      </Animated.View>
      {/* Hidden driver input — keeps the OS keyboard + SMS autofill working. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />
    </Pressable>
  );
}
