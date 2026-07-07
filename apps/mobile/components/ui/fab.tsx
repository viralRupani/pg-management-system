import { Ionicons } from '@expo/vector-icons';

import { useTokens } from '@/components/theme-provider';
import { PressableScale } from '@/components/ui/pressable-scale';

/** Floating action button (design `.fab`): brand circle, bottom-right. */
export function Fab({
  icon = 'add',
  onPress,
  accessibilityLabel,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const tokens = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      haptic="tap"
      pressedScale={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg shadow-black/25"
    >
      <Ionicons name={icon} size={26} color={tokens.brandForeground} />
    </PressableScale>
  );
}
