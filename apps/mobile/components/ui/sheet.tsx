import { vars } from 'nativewind';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { brandPalette } from '@/lib/theme';

/**
 * Bottom sheet (design `.sheet`): dim scrim, rounded top, grab handle, title +
 * subtitle, then children. Dismiss by tapping the scrim or the platform back.
 * Gesture-drag dismiss is deliberately omitted (Expo Go, keep deps light).
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { accent } = useTheme();
  // RN Modals portal outside the root view tree, so the ThemeProvider's `vars()`
  // don't reach here — re-apply the brand palette on the Modal's own root.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={vars(brandPalette(accent))}
        className="flex-1 justify-end bg-black/40"
      >
        {/* Stop propagation: taps inside the sheet must not close it. */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ paddingBottom: insets.bottom + 18 }}
          className="rounded-t-sheet bg-surface px-[18px] pt-2.5"
        >
          <View className="mb-3 mt-1 h-[5px] w-[38px] self-center rounded-full bg-line" />
          <Text className="text-[18px] font-bold text-ink">{title}</Text>
          {subtitle ? (
            <Text className="mt-1 text-[13.5px] text-ink2">{subtitle}</Text>
          ) : null}
          <View className="mt-4 gap-3">{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
