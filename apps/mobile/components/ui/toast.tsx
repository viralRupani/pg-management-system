import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';

type ToastKind = 'success' | 'error' | 'info';

interface ToastPayload {
  id: number;
  kind: ToastKind;
  message: string;
}

let pushToast: ((t: ToastPayload) => void) | null = null;

function emit(kind: ToastKind, message: string): void {
  if (kind === 'success') haptics.success();
  if (kind === 'error') haptics.error();
  pushToast?.({ id: Date.now(), kind, message });
}

/**
 * Non-blocking feedback for completed/failed actions — replaces success/info
 * `Alert.alert`s (Alert stays for destructive confirms and blocking errors).
 * NOTE: toasts render in the root tree, so a handler inside an open Sheet must
 * `onClose()` the sheet BEFORE toasting (RN Modals sit above everything).
 */
export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  info: (message: string) => emit('info', message),
};

const ICON: Record<ToastKind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

/** Mounted once in the root layout, inside ThemeProvider's var scope. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const tokens = useTokens();
  const [current, setCurrent] = useState<ToastPayload | null>(null);

  useEffect(() => {
    pushToast = setCurrent;
    return () => {
      pushToast = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), 2600);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const iconColor =
    current.kind === 'success'
      ? tokens.success
      : current.kind === 'error'
        ? tokens.danger
        : tokens.info;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}
    >
      <Animated.View
        key={current.id}
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutUp.duration(160)}
        className="mx-4"
      >
        <Pressable
          onPress={() => setCurrent(null)}
          className="flex-row items-center gap-2.5 rounded-tile border border-line bg-surface px-3.5 py-3 shadow-lg shadow-black/20"
        >
          <Ionicons name={ICON[current.kind]} size={20} color={iconColor} />
          <AppText variant="label" className="flex-1" numberOfLines={2}>
            {current.message}
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}
