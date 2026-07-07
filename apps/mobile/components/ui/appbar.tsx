import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';

/**
 * Secondary-screen header (design `.appbar`): circular back button, centered-ish
 * title, optional trailing action. Use inside a SafeAreaView-padded screen.
 */
export function Appbar({
  title,
  action,
  onBack,
}: {
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const tokens = useTokens();
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
      <PressableScale
        onPress={onBack ?? (() => router.back())}
        pressedScale={0.9}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface"
      >
        <Ionicons name="chevron-back" size={20} color={tokens.ink} />
      </PressableScale>
      <AppText variant="heading" className="flex-1 text-[19px]" numberOfLines={1}>
        {title}
      </AppText>
      {action}
    </View>
  );
}
