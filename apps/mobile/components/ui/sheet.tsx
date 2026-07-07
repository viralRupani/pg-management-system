import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeVars } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';

/**
 * Bottom sheet (design `.sheet`): dim scrim, rounded top, grab handle, title +
 * subtitle, then children. Springs up on open; dismiss by dragging the header
 * down, tapping the scrim, or the platform back.
 *
 * Two portal gotchas (RN Modals mount OUTSIDE the root tree):
 *  - theme vars must be re-applied on the Modal's own root (useThemeVars), and
 *  - gesture-handler needs its own GestureHandlerRootView inside the Modal.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  animated = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Slide-up + scrim-fade on open/close. Set false to appear/dismiss instantly. */
  animated?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const themeVars = useThemeVars();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.value = 0;
      // Ease the panel up instead of springing it — a spring overshoots past the
      // resting point (translateY goes negative), which reads as the sheet
      // "jumping" on open. Timing slides smoothly to rest with no bounce.
      progress.value = animated
        ? withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) })
        : 1;
    } else if (mounted) {
      if (animated) {
        progress.value = withTiming(0, { duration: 180 }, (finished) => {
          if (finished) runOnJS(setMounted)(false);
        });
      } else {
        progress.value = 0;
        setMounted(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 480 + dragY.value }],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[themeVars, { flex: 1, justifyContent: 'flex-end' }]}>
          <Animated.View
            style={[scrimStyle, { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }]}
            className="bg-black/50"
          >
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View
              style={[panelStyle, { paddingBottom: insets.bottom + 18, maxHeight: '100%' }]}
              className="rounded-t-sheet bg-surface px-[18px] pt-2.5"
            >
              <GestureDetector gesture={pan}>
                {/* Grab zone: handle + title row; dragging here dismisses. */}
                <View className="pb-1">
                  <View className="mb-3 mt-1 h-[5px] w-[38px] self-center rounded-full bg-line" />
                  <AppText variant="heading" className="text-[18px]">
                    {title}
                  </AppText>
                  {subtitle ? (
                    <AppText variant="sub" className="mt-1">
                      {subtitle}
                    </AppText>
                  ) : null}
                </View>
              </GestureDetector>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerClassName="gap-3 pt-4"
              >
                {children}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
